import { describe, expect, it } from "vite-plus/test";

import {
  applyChevronAnimations,
  CHEVRON_ANIMATIONS_STORAGE_KEY,
  readStoredChevronAnimations,
} from "./chevronAnimations";

function storageWith(value: string | null): Pick<Storage, "getItem"> {
  return { getItem: (key) => (key === CHEVRON_ANIMATIONS_STORAGE_KEY ? value : null) };
}

describe("chevron animations", () => {
  it("is on unless explicitly turned off", () => {
    expect(readStoredChevronAnimations(storageWith(null))).toBe(true);
    expect(readStoredChevronAnimations(storageWith("on"))).toBe(true);
    expect(readStoredChevronAnimations(storageWith("garbage"))).toBe(true);
    expect(readStoredChevronAnimations(storageWith("off"))).toBe(false);
    expect(readStoredChevronAnimations(null)).toBe(true);
  });

  it("marks the root only when off", () => {
    const root = { dataset: {} as DOMStringMap };
    applyChevronAnimations(root, false);
    expect(root.dataset.chevronAnimations).toBe("off");
    applyChevronAnimations(root, true);
    expect(root.dataset.chevronAnimations).toBeUndefined();
  });
});
