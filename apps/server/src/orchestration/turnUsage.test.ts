import { describe, expect, it } from "vite-plus/test";

import { addTurnTokens, buildTurnUsagePayload, normalizeRateLimitSnapshot } from "./turnUsage.ts";

describe("normalizeRateLimitSnapshot", () => {
  it("reads Claude Code rate limit events", () => {
    expect(
      normalizeRateLimitSnapshot({
        rateLimits: {
          type: "rate_limit_event",
          rate_limit_info: {
            status: "allowed_warning",
            rateLimitType: "five_hour",
            utilization: 0.834,
          },
        },
      }),
    ).toEqual({
      usedPercent: 83.4,
      windowLabel: "5h Limit",
      status: "warning",
      overage: false,
      windows: [{ label: "5h Limit", usedPercent: 83.4 }],
    });
  });

  it("reads every Claude window when the account is over the limit", () => {
    // Real payload: once rejected, Claude Code drops the top-level utilization.
    expect(
      normalizeRateLimitSnapshot({
        rateLimits: {
          type: "rate_limit_event",
          rate_limit_info: {
            status: "rejected",
            resetsAt: 1788384600,
            rateLimitType: "five_hour",
            overageStatus: "allowed",
            isUsingOverage: true,
            overageInUse: true,
            unifiedWindows: {
              five_hour: { utilization: 1.05, resetsAt: 1788384600 },
              seven_day: { utilization: 0.22, resetsAt: 1788606000 },
              seven_day_overage_included: { utilization: 0.43, resetsAt: 1788606000 },
            },
          },
        },
      }),
    ).toEqual({
      usedPercent: 100,
      windowLabel: "5h Limit",
      status: "rejected",
      overage: true,
      windows: [
        { label: "5h Limit", usedPercent: 100, resetsAt: "2026-09-02T21:30:00.000Z" },
        { label: "7d Limit incl. Overage", usedPercent: 43, resetsAt: "2026-09-05T11:00:00.000Z" },
        { label: "7d Limit", usedPercent: 22, resetsAt: "2026-09-05T11:00:00.000Z" },
      ],
    });
  });

  it("carries each window's reset time as an ISO timestamp", () => {
    const claude = normalizeRateLimitSnapshot({
      rateLimits: {
        rate_limit_info: {
          status: "allowed",
          rateLimitType: "five_hour",
          utilization: 0.5,
          resetsAt: 1788384600,
          unifiedWindows: {
            five_hour: { utilization: 0.5, resetsAt: 1788384600 },
            seven_day: { utilization: 0.2 },
          },
        },
      },
    });
    expect(claude?.windows).toEqual([
      { label: "5h Limit", usedPercent: 50, resetsAt: "2026-09-02T21:30:00.000Z" },
      { label: "7d Limit", usedPercent: 20 },
    ]);

    const codex = normalizeRateLimitSnapshot({
      rateLimits: {
        primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1788384600 },
        secondary: { usedPercent: 41, windowDurationMins: 10080, resetsAt: null },
      },
    });
    expect(codex?.windows).toEqual([
      { label: "Weekly Limit", usedPercent: 41 },
      { label: "5h Limit", usedPercent: 12, resetsAt: "2026-09-02T21:30:00.000Z" },
    ]);
  });

  it("headlines the window Claude flagged even when another is tighter", () => {
    const snapshot = normalizeRateLimitSnapshot({
      rateLimits: {
        rate_limit_info: {
          status: "allowed_warning",
          rateLimitType: "seven_day",
          utilization: 0.9,
          unifiedWindows: {
            five_hour: { utilization: 0.95 },
            seven_day: { utilization: 0.9 },
          },
        },
      },
    });
    expect(snapshot?.windowLabel).toBe("7d Limit");
    expect(snapshot?.usedPercent).toBe(90);
    expect(snapshot?.windows[0]).toEqual({ label: "5h Limit", usedPercent: 95 });
  });

  it("treats a rejection without numbers as a full window", () => {
    expect(
      normalizeRateLimitSnapshot({
        rateLimits: { rate_limit_info: { status: "rejected", rateLimitType: "five_hour" } },
      }),
    ).toMatchObject({ usedPercent: 100, windowLabel: "5h Limit", status: "rejected" });
  });

  it("flags Claude overage", () => {
    expect(
      normalizeRateLimitSnapshot({
        rateLimits: {
          rate_limit_info: { status: "allowed", rateLimitType: "overage", utilization: 0.1 },
        },
      })?.overage,
    ).toBe(true);
  });

  it("reads Codex rate limit windows and keeps the tightest one", () => {
    expect(
      normalizeRateLimitSnapshot({
        rateLimits: {
          primary: { usedPercent: 12, windowDurationMins: 300 },
          secondary: { usedPercent: 41, windowDurationMins: 10080 },
        },
      }),
    ).toEqual({
      usedPercent: 41,
      windowLabel: "Weekly Limit",
      status: "allowed",
      overage: false,
      windows: [
        { label: "Weekly Limit", usedPercent: 41 },
        { label: "5h Limit", usedPercent: 12 },
      ],
    });
  });

  it("reads the Codex notification as the adapter forwards it, nested twice", () => {
    expect(
      normalizeRateLimitSnapshot({
        rateLimits: {
          rateLimits: {
            planType: "plus",
            primary: { usedPercent: 7, windowDurationMins: 300, resetsAt: null },
            secondary: { usedPercent: 3, windowDurationMins: 10080, resetsAt: null },
          },
        },
      }),
    ).toMatchObject({ usedPercent: 7, windowLabel: "5h Limit", status: "allowed" });
  });

  it("ignores payloads it does not understand", () => {
    expect(normalizeRateLimitSnapshot({ rateLimits: { hello: 1 } })).toBeNull();
    expect(normalizeRateLimitSnapshot("nope")).toBeNull();
  });
});

describe("buildTurnUsagePayload", () => {
  it("combines tokens, cost, and the window delta around the turn", () => {
    expect(
      buildTurnUsagePayload({
        usage: { input_tokens: 1200, cache_read_input_tokens: 800, output_tokens: 300 },
        totalCostUsd: 0.0421,
        provider: "claude",
        before: {
          usedPercent: 10,
          windowLabel: "5h Limit",
          status: "allowed",
          overage: false,
          windows: [{ label: "5h Limit", usedPercent: 10 }],
        },
        after: {
          usedPercent: 12.5,
          windowLabel: "5h Limit",
          status: "allowed",
          overage: false,
          windows: [{ label: "5h Limit", usedPercent: 12.5 }],
        },
      }),
    ).toEqual({
      provider: "claude",
      inputTokens: 2000,
      outputTokens: 300,
      totalCostUsd: 0.0421,
      windowDeltaPercent: 2.5,
      windowUsedPercent: 12.5,
      windowLabel: "5h Limit",
      windows: [{ label: "5h Limit", usedPercent: 12.5 }],
      billing: "included",
    });
  });

  it("diffs the headline window against the same window before the turn", () => {
    expect(
      buildTurnUsagePayload({
        usage: { input_tokens: 1, output_tokens: 1 },
        totalCostUsd: undefined,
        provider: "claude",
        before: {
          usedPercent: 20,
          windowLabel: "7d Limit",
          status: "allowed",
          overage: false,
          windows: [
            { label: "5h Limit", usedPercent: 97 },
            { label: "7d Limit", usedPercent: 20 },
          ],
        },
        after: {
          usedPercent: 100,
          windowLabel: "5h Limit",
          status: "rejected",
          overage: true,
          windows: [
            { label: "5h Limit", usedPercent: 100 },
            { label: "7d Limit", usedPercent: 22 },
          ],
        },
      }),
    ).toMatchObject({ windowDeltaPercent: 3, windowUsedPercent: 100, billing: "overage" });
  });

  it("bounds the share by the post-turn window when there is no baseline", () => {
    const quiet = {
      usedPercent: 0,
      windowLabel: "5h limit",
      status: "allowed",
      overage: false,
      windows: [{ label: "5h limit", usedPercent: 0 }],
    } as const;
    expect(
      buildTurnUsagePayload({
        provider: "claude",
        usage: { input_tokens: 11_000, output_tokens: 357 },
        totalCostUsd: 0.17,
        before: null,
        after: quiet,
      }),
    ).toMatchObject({ windowDeltaPercent: 0, windowUsedPercent: 0, billing: "included" });
    expect(
      buildTurnUsagePayload({
        provider: "claude",
        usage: undefined,
        totalCostUsd: 0.17,
        before: null,
        after: { ...quiet, usedPercent: 12, windows: [{ label: "5h limit", usedPercent: 12 }] },
      }),
    ).toMatchObject({ windowDeltaPercent: null, windowUsedPercent: 12, billing: "included" });
  });

  it("marks overage and warnings from the post-turn snapshot", () => {
    const base = {
      usage: { input_tokens: 1, output_tokens: 1 },
      totalCostUsd: undefined,
      before: null,
    };
    expect(
      buildTurnUsagePayload({
        ...base,
        after: {
          usedPercent: 100,
          windowLabel: "5h Limit",
          status: "rejected",
          overage: true,
          windows: [],
        },
      })?.billing,
    ).toBe("overage");
    expect(
      buildTurnUsagePayload({
        ...base,
        after: {
          usedPercent: 90,
          windowLabel: "5h Limit",
          status: "warning",
          overage: false,
          windows: [],
        },
      })?.billing,
    ).toBe("warning");
  });

  it("returns nothing when the provider reported nothing", () => {
    expect(
      buildTurnUsagePayload({
        usage: undefined,
        totalCostUsd: undefined,
        before: null,
        after: null,
      }),
    ).toBeNull();
    expect(
      buildTurnUsagePayload({
        usage: undefined,
        totalCostUsd: undefined,
        before: null,
        after: null,
      }),
    ).toBeNull();
  });

  it("stays silent for a completed turn the provider reported nothing about", () => {
    expect(
      buildTurnUsagePayload({
        provider: "cursor",
        usage: undefined,
        totalCostUsd: undefined,
        before: null,
        after: null,
      }),
    ).toBeNull();
  });
});

describe("addTurnTokens", () => {
  it("sums the per-call counts Codex reports while a turn runs", () => {
    const first = addTurnTokens(undefined, {
      usedTokens: 1200,
      lastInputTokens: 1000,
      lastOutputTokens: 200,
    });
    const second = addTurnTokens(first, {
      usedTokens: 1500,
      inputTokens: 1300,
      outputTokens: 200,
      lastInputTokens: 1300,
      lastOutputTokens: 200,
    });
    expect(second).toEqual({ input_tokens: 2300, output_tokens: 400 });
    expect(
      buildTurnUsagePayload({
        provider: "codex",
        usage: second,
        totalCostUsd: undefined,
        before: null,
        after: null,
      }),
    ).toMatchObject({ inputTokens: 2300, outputTokens: 400 });
  });

  it("falls back to the running totals when a report has no per-call counts", () => {
    expect(addTurnTokens(undefined, { usedTokens: 50, inputTokens: 40, outputTokens: 10 })).toEqual(
      {
        input_tokens: 40,
        output_tokens: 10,
      },
    );
  });
});

describe("plan limits without usage numbers", () => {
  it("reads the normalized windows shape adapters send on their own", () => {
    expect(
      normalizeRateLimitSnapshot({
        rateLimits: { windows: [{ label: "Plan Limit", usedPercent: 100 }], status: "rejected" },
      }),
    ).toEqual({
      usedPercent: 100,
      windowLabel: "Plan Limit",
      status: "rejected",
      overage: false,
      windows: [{ label: "Plan Limit", usedPercent: 100 }],
    });
    expect(normalizeRateLimitSnapshot({ rateLimits: { windows: [] } })).toBeNull();
    expect(normalizeRateLimitSnapshot({ rateLimits: null })).toBeNull();
  });

  it("bills a rejected window as limited unless the plan ran into overage", () => {
    const base = { usage: undefined, totalCostUsd: undefined, before: null };
    const rejected = {
      usedPercent: 100,
      windowLabel: "Plan Limit",
      status: "rejected" as const,
      windows: [{ label: "Plan Limit", usedPercent: 100 }],
    };
    expect(
      buildTurnUsagePayload({ ...base, after: { ...rejected, overage: false } }),
    ).toMatchObject({ windowUsedPercent: 100, windowLabel: "Plan Limit", billing: "limited" });
    expect(buildTurnUsagePayload({ ...base, after: { ...rejected, overage: true } })?.billing).toBe(
      "overage",
    );
  });
});
