/**
 * Turns provider usage reports into one `provider.turn.usage` activity per
 * turn so clients can show what a turn cost. Rate limits arrive as opaque
 * provider payloads (`account.rate-limits.updated`); this module normalizes
 * the two shapes T3 Neo understands and diffs them around a turn.
 */

import type {
  OrchestrationThreadActivity,
  ThreadTokenUsageSnapshot,
  TurnId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

export const TURN_USAGE_ACTIVITY_KIND = "provider.turn.usage";

/** "limited": the plan refused the turn without billing overage (window rejected, or Cursor's upgrade notice). */
export type TurnUsageBilling = "included" | "warning" | "overage" | "limited" | "unknown";

export interface RateLimitWindow {
  readonly label: string;
  readonly usedPercent: number;
  /** When the window resets, as an ISO timestamp, when the provider says. */
  readonly resetsAt?: string;
}

/** Providers report reset times as unix seconds. */
function resetsAtIso(seconds: number | null): string | undefined {
  return seconds === null || seconds <= 0
    ? undefined
    : DateTime.formatIso(DateTime.makeUnsafe(seconds * 1000));
}

export interface RateLimitSnapshot {
  /** Utilization of the most constrained plan window, in percent. */
  readonly usedPercent: number;
  readonly windowLabel: string;
  readonly status: "allowed" | "warning" | "rejected";
  readonly overage: boolean;
  /** Every plan window the provider reported, tightest first. */
  readonly windows: ReadonlyArray<RateLimitWindow>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function numberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const CLAUDE_WINDOW_LABELS: Record<string, string> = {
  five_hour: "5h Limit",
  seven_day: "7d Limit",
  seven_day_opus: "7d Opus Limit",
  seven_day_sonnet: "7d Sonnet Limit",
  seven_day_overage_included: "7d Limit incl. Overage",
  overage: "overage",
};

function claudeWindowLabel(type: string): string {
  return CLAUDE_WINDOW_LABELS[type] ?? `${type.replace(/_/g, " ")} Limit`;
}

function utilizationPercent(utilization: number): number {
  return Math.round(Math.max(0, Math.min(100, utilization * 100)) * 10) / 10;
}

/**
 * Claude Code emits `rate_limit_event` messages with `rate_limit_info`
 * (status, rateLimitType, utilization 0..1, overageStatus). Once the account
 * is over a limit the top-level `utilization` disappears and only
 * `unifiedWindows` (per-window utilization) remains, so windows are read
 * from there first. Codex emits `account/rateLimits/updated` with
 * primary/secondary windows in percent.
 */
export function normalizeRateLimitSnapshot(payload: unknown): RateLimitSnapshot | null {
  const record = asRecord(payload);
  if (!record) return null;
  // Adapters wrap the provider notification in `rateLimits`, and Codex's own
  // notification params are `{ rateLimits: snapshot }` too, so the snapshot
  // can sit two levels down.
  let rateLimits = record;
  for (let depth = 0; depth < 2; depth += 1) {
    const inner = asRecord(rateLimits.rateLimits);
    if (!inner) break;
    rateLimits = inner;
  }

  // Adapters without a provider report of their own (Cursor) send the
  // normalized shape directly: windows plus an optional status.
  if (Array.isArray(rateLimits.windows)) {
    const windows = rateLimits.windows.flatMap((window): RateLimitWindow[] => {
      const windowRecord = asRecord(window);
      const usedPercent = numberField(windowRecord, "usedPercent");
      const label = typeof windowRecord?.label === "string" ? windowRecord.label : null;
      if (usedPercent === null || label === null) return [];
      const resetsAt = resetsAtIso(numberField(windowRecord, "resetsAt"));
      return [
        {
          label,
          usedPercent: Math.max(0, Math.min(100, usedPercent)),
          ...(resetsAt ? { resetsAt } : {}),
        },
      ];
    });
    if (windows.length === 0) return null;
    const sorted = [...windows].sort((a, b) => b.usedPercent - a.usedPercent);
    const tightest = sorted[0]!;
    const status = rateLimits.status;
    return {
      usedPercent: tightest.usedPercent,
      windowLabel: tightest.label,
      status:
        status === "rejected" || tightest.usedPercent >= 100
          ? "rejected"
          : status === "warning" || tightest.usedPercent >= 80
            ? "warning"
            : "allowed",
      overage: false,
      windows: sorted,
    };
  }

  const claude = asRecord(rateLimits.rate_limit_info);
  if (claude) {
    const type = typeof claude.rateLimitType === "string" ? claude.rateLimitType : null;
    const status = claude.status;
    const overageStatus = claude.overageStatus;

    const windowByLabel = new Map<string, RateLimitWindow>();
    const unifiedWindows = asRecord(claude.unifiedWindows);
    if (unifiedWindows) {
      for (const [windowType, window] of Object.entries(unifiedWindows)) {
        const windowRecord = asRecord(window);
        const utilization = numberField(windowRecord, "utilization");
        if (utilization === null) continue;
        const label = claudeWindowLabel(windowType);
        const resetsAt = resetsAtIso(numberField(windowRecord, "resetsAt"));
        windowByLabel.set(label, {
          label,
          usedPercent: utilizationPercent(utilization),
          ...(resetsAt ? { resetsAt } : {}),
        });
      }
    }
    const typeLabel = type ? claudeWindowLabel(type) : "Plan Limit";
    const utilization = numberField(claude, "utilization");
    if (utilization !== null && !windowByLabel.has(typeLabel)) {
      const resetsAt = resetsAtIso(numberField(claude, "resetsAt"));
      windowByLabel.set(typeLabel, {
        label: typeLabel,
        usedPercent: utilizationPercent(utilization),
        ...(resetsAt ? { resetsAt } : {}),
      });
    }

    const windows = [...windowByLabel.values()].sort((a, b) => b.usedPercent - a.usedPercent);
    // The window Claude flagged as the reason for its status, else the tightest.
    const headline =
      windows.find((window) => window.label === typeLabel) ??
      windows[0] ??
      // No numbers at all: a rejection still means the window is full.
      ({ label: typeLabel, usedPercent: status === "rejected" ? 100 : 0 } as const);
    return {
      usedPercent: headline.usedPercent,
      windowLabel: headline.label,
      status:
        status === "rejected" ? "rejected" : status === "allowed_warning" ? "warning" : "allowed",
      overage:
        type === "overage" ||
        claude.isUsingOverage === true ||
        (status === "rejected" && overageStatus === "allowed"),
      windows: windows.length > 0 ? windows : [headline],
    };
  }

  const windows = [
    { record: asRecord(rateLimits.primary), fallbackLabel: "5h Limit" },
    { record: asRecord(rateLimits.secondary), fallbackLabel: "Weekly Limit" },
  ].flatMap(({ record: windowRecord, fallbackLabel }) => {
    const usedPercent = numberField(windowRecord, "usedPercent");
    if (usedPercent === null) return [];
    const minutes = numberField(windowRecord, "windowDurationMins");
    const label =
      minutes === null
        ? fallbackLabel
        : minutes >= 60 * 24 * 6
          ? "Weekly Limit"
          : minutes >= 60
            ? `${Math.round(minutes / 60)}h Limit`
            : `${minutes}m Limit`;
    const resetsAt = resetsAtIso(numberField(windowRecord, "resetsAt"));
    return [{ usedPercent, label, ...(resetsAt ? { resetsAt } : {}) }];
  });
  if (windows.length === 0) return null;
  const tightest = windows.reduce((best, entry) =>
    entry.usedPercent > best.usedPercent ? entry : best,
  );
  return {
    usedPercent: Math.max(0, Math.min(100, tightest.usedPercent)),
    windowLabel: tightest.label,
    status:
      tightest.usedPercent >= 100 ? "rejected" : tightest.usedPercent >= 80 ? "warning" : "allowed",
    overage: false,
    windows: [...windows].sort((a, b) => b.usedPercent - a.usedPercent),
  };
}

/** Token totals of one turn, in the shape `buildTurnUsagePayload` reads as `usage`. */
export interface TurnTokenTotals {
  readonly input_tokens: number;
  readonly output_tokens: number;
}

/**
 * Codex reports tokens per model call (`thread.token-usage.updated`, with the
 * call's counts in `last*`) rather than on `turn.completed`, so a turn's total
 * is the sum of the reports made while it ran.
 */
export function addTurnTokens(
  totals: TurnTokenTotals | undefined,
  snapshot: ThreadTokenUsageSnapshot,
): TurnTokenTotals {
  return {
    input_tokens:
      (totals?.input_tokens ?? 0) + (snapshot.lastInputTokens ?? snapshot.inputTokens ?? 0),
    output_tokens:
      (totals?.output_tokens ?? 0) + (snapshot.lastOutputTokens ?? snapshot.outputTokens ?? 0),
  };
}

export interface TurnUsageActivityPayload {
  /** Provider that ran the turn, so clients can attach a plan or provider name. */
  readonly provider: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalCostUsd: number | null;
  readonly windowDeltaPercent: number | null;
  readonly windowUsedPercent: number | null;
  readonly windowLabel: string | null;
  /** Every plan window after the turn, tightest first. */
  readonly windows: ReadonlyArray<RateLimitWindow>;
  readonly billing: TurnUsageBilling;
}

function tokenCount(
  usage: Record<string, unknown> | null,
  keys: ReadonlyArray<string>,
): number | null {
  if (!usage) return null;
  let total: number | null = null;
  for (const key of keys) {
    const value = numberField(usage, key);
    if (value !== null) total = (total ?? 0) + value;
  }
  return total;
}

export function buildTurnUsagePayload(input: {
  readonly provider?: string | null;
  readonly usage: unknown;
  readonly totalCostUsd: number | undefined;
  readonly before: RateLimitSnapshot | null;
  readonly after: RateLimitSnapshot | null;
}): TurnUsageActivityPayload | null {
  const usage = asRecord(input.usage);
  const inputTokens = tokenCount(usage, [
    "input_tokens",
    "inputTokens",
    "cache_read_input_tokens",
    "cacheReadInputTokens",
    "cached_input_tokens",
  ]);
  const outputTokens = tokenCount(usage, ["output_tokens", "outputTokens"]);
  const totalCostUsd =
    typeof input.totalCostUsd === "number" && Number.isFinite(input.totalCostUsd)
      ? input.totalCostUsd
      : null;
  const after = input.after;
  // Diff the headline window against the same window before the turn, even
  // when the provider flagged a different window back then.
  const beforeWindow =
    after && input.before
      ? (input.before.windows.find((window) => window.label === after.windowLabel) ??
        (input.before.windowLabel === after.windowLabel ? input.before : null))
      : null;
  // Without a baseline (the first turn since the server saw this account) a
  // window still under 1% after the turn bounds the turn's share all the same.
  const windowDeltaPercent =
    after && beforeWindow
      ? Math.max(0, after.usedPercent - beforeWindow.usedPercent)
      : after && after.usedPercent < 1
        ? after.usedPercent
        : null;
  // A turn the provider said nothing about stays silent: a badge with no
  // numbers behind it would only restate the plan name.
  if (inputTokens === null && outputTokens === null && totalCostUsd === null && after === null) {
    return null;
  }
  const billing: TurnUsageBilling = after
    ? after.overage
      ? "overage"
      : after.status === "rejected"
        ? "limited"
        : after.status === "warning"
          ? "warning"
          : "included"
    : totalCostUsd !== null
      ? "unknown"
      : "unknown";
  return {
    provider: input.provider ?? null,
    inputTokens,
    outputTokens,
    totalCostUsd,
    windowDeltaPercent,
    windowUsedPercent: after?.usedPercent ?? null,
    windowLabel: after?.windowLabel ?? null,
    windows: after?.windows ?? [],
    billing,
  };
}

export function turnUsageActivity(input: {
  readonly eventId: string;
  readonly turnId: TurnId | null;
  readonly createdAt: string;
  readonly payload: TurnUsageActivityPayload;
}): OrchestrationThreadActivity {
  return {
    id: `${input.eventId}:usage` as OrchestrationThreadActivity["id"],
    createdAt: input.createdAt as OrchestrationThreadActivity["createdAt"],
    tone: "info",
    kind: TURN_USAGE_ACTIVITY_KIND,
    summary: "Turn usage",
    payload: input.payload,
    turnId: input.turnId,
  };
}
