/**
 * Neo policy for a new chat's model options. When the selected model offers a
 * context-window choice or a fast-mode toggle, a fresh chat should land on the
 * fork's preferred default (smallest context, slowest/off fast mode) instead of
 * the provider's. It biases the option descriptors' `currentValue`; a saved
 * selection on an existing thread still wins, because the composer merges
 * stored selections over the descriptors after this runs.
 */

import type { ModelCapabilities, ProviderOptionChoice } from "@t3tools/contracts";

import {
  type NeoContextWindowDefault,
  type NeoFastModeDefault,
  useNeoSettingsStore,
} from "./neoSettings";

export interface NeoModelDefaultPrefs {
  readonly contextWindow: NeoContextWindowDefault;
  readonly fastMode: NeoFastModeDefault;
}

/** The current Neo defaults, read synchronously for the non-React dispatch builders. */
export function readNeoModelDefaultPrefs(): NeoModelDefaultPrefs {
  const settings = useNeoSettingsStore.getState().settings;
  return { contextWindow: settings.defaultContextWindow, fastMode: settings.defaultFastMode };
}

const SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*([km])?/i;

/** Parse a context-window magnitude from an option id or label ("200k", "1M", "1000000"). */
function parseContextSize(text: string): number | null {
  const match = SIZE_PATTERN.exec(text);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!);
  if (!Number.isFinite(value)) return null;
  const unit = match[2]?.toLowerCase();
  if (unit === "m") return value * 1_000_000;
  if (unit === "k") return value * 1_000;
  return value;
}

/**
 * Which context-window option to default to. Prefers the parsed token counts
 * when every option carries one; otherwise trusts the provider's order (first
 * is smallest, last is biggest), which is how the catalogs list them.
 */
export function pickContextWindowOptionId(
  options: ReadonlyArray<ProviderOptionChoice>,
  preference: NeoContextWindowDefault,
): string | undefined {
  if (options.length < 2) return undefined;
  const sized = options.map((option) => ({
    id: option.id,
    size: parseContextSize(option.id) ?? parseContextSize(option.label),
  }));
  if (sized.every((entry) => entry.size !== null)) {
    const sorted = [...sized].sort((a, b) => a.size! - b.size!);
    return preference === "biggest" ? sorted[sorted.length - 1]!.id : sorted[0]!.id;
  }
  return preference === "biggest" ? options[options.length - 1]!.id : options[0]!.id;
}

/**
 * Bias a model's option descriptors toward the Neo defaults. Only touches the
 * `contextWindow` select and the `fastMode` boolean; every other option, and
 * any model without them, is returned untouched.
 */
export function applyNeoModelOptionDefaults(
  caps: ModelCapabilities,
  prefs: NeoModelDefaultPrefs,
): ModelCapabilities {
  const descriptors = caps.optionDescriptors;
  if (!descriptors || descriptors.length === 0) return caps;

  let changed = false;
  const next = descriptors.map((descriptor) => {
    if (descriptor.type === "select" && descriptor.id === "contextWindow") {
      const target = pickContextWindowOptionId(descriptor.options, prefs.contextWindow);
      if (target && target !== descriptor.currentValue) {
        changed = true;
        return { ...descriptor, currentValue: target };
      }
    }
    if (descriptor.type === "boolean" && descriptor.id === "fastMode") {
      const target = prefs.fastMode === "fastest";
      if (descriptor.currentValue !== target) {
        changed = true;
        return { ...descriptor, currentValue: target };
      }
    }
    return descriptor;
  });

  return changed ? { ...caps, optionDescriptors: next } : caps;
}
