import type { ModelCapabilities } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyNeoModelOptionDefaults,
  pickContextWindowOptionId,
  type NeoModelDefaultPrefs,
} from "./neoModelDefaults";

const SLOWEST_SMALLEST: NeoModelDefaultPrefs = { contextWindow: "smallest", fastMode: "slowest" };
const BIGGEST_FASTEST: NeoModelDefaultPrefs = { contextWindow: "biggest", fastMode: "fastest" };

function capsWith(
  ...optionDescriptors: ModelCapabilities["optionDescriptors"] & object
): ModelCapabilities {
  return { optionDescriptors };
}

describe("pickContextWindowOptionId", () => {
  it("uses parsed token counts regardless of option order", () => {
    const options = [
      { id: "1m", label: "1M" },
      { id: "200k", label: "200k" },
    ];
    expect(pickContextWindowOptionId(options, "smallest")).toBe("200k");
    expect(pickContextWindowOptionId(options, "biggest")).toBe("1m");
  });

  it("falls back to provider order when labels carry no size", () => {
    const options = [
      { id: "standard", label: "Standard" },
      { id: "expanded", label: "Expanded" },
    ];
    expect(pickContextWindowOptionId(options, "smallest")).toBe("standard");
    expect(pickContextWindowOptionId(options, "biggest")).toBe("expanded");
  });

  it("returns nothing when there is no real choice", () => {
    expect(pickContextWindowOptionId([{ id: "200k", label: "200k" }], "biggest")).toBeUndefined();
  });
});

describe("applyNeoModelOptionDefaults", () => {
  it("defaults the context window to the smallest and fast mode off", () => {
    const caps = capsWith(
      {
        id: "contextWindow",
        label: "Context Window",
        type: "select",
        options: [
          { id: "standard", label: "Standard" },
          { id: "expanded", label: "Expanded", isDefault: true },
        ],
        currentValue: "expanded",
      },
      { id: "fastMode", label: "Fast Mode", type: "boolean", currentValue: true },
    );
    const next = applyNeoModelOptionDefaults(caps, SLOWEST_SMALLEST);
    const context = next.optionDescriptors![0]!;
    const fast = next.optionDescriptors![1]!;
    expect(context.type === "select" && context.currentValue).toBe("standard");
    expect(fast.type === "boolean" && fast.currentValue).toBe(false);
  });

  it("defaults the context window to the biggest and fast mode on", () => {
    const caps = capsWith(
      {
        id: "contextWindow",
        label: "Context Window",
        type: "select",
        options: [
          { id: "200k", label: "200k", isDefault: true },
          { id: "1m", label: "1M" },
        ],
      },
      { id: "fastMode", label: "Fast Mode", type: "boolean", currentValue: false },
    );
    const next = applyNeoModelOptionDefaults(caps, BIGGEST_FASTEST);
    const context = next.optionDescriptors![0]!;
    const fast = next.optionDescriptors![1]!;
    expect(context.type === "select" && context.currentValue).toBe("1m");
    expect(fast.type === "boolean" && fast.currentValue).toBe(true);
  });

  it("leaves unrelated options and option-less models untouched", () => {
    const caps = capsWith({
      id: "effort",
      label: "Effort",
      type: "select",
      options: [{ id: "high", label: "High", isDefault: true }],
    });
    expect(applyNeoModelOptionDefaults(caps, SLOWEST_SMALLEST)).toBe(caps);
    expect(applyNeoModelOptionDefaults({}, SLOWEST_SMALLEST)).toEqual({});
  });
});
