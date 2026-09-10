import { describe, expect, it } from "vite-plus/test";

import {
  APPEARANCE_LOOK_STORAGE_KEY,
  applyAppearanceLook,
  isAppearanceLook,
  readStoredAppearanceLook,
} from "./appearanceLook";

function storageWith(value: string | null): Pick<Storage, "getItem"> {
  return { getItem: (key) => (key === APPEARANCE_LOOK_STORAGE_KEY ? value : null) };
}

describe("appearance look", () => {
  it("defaults to Neo and honors an explicit standard choice", () => {
    expect(readStoredAppearanceLook(storageWith(null))).toBe("neo");
    expect(readStoredAppearanceLook(storageWith("default"))).toBe("default");
    expect(readStoredAppearanceLook(storageWith("neo"))).toBe("neo");
    expect(readStoredAppearanceLook(storageWith("cyber"))).toBe("neo");
    expect(readStoredAppearanceLook(null)).toBe("neo");
  });

  it("migrates the pre-rename value", () => {
    expect(readStoredAppearanceLook(storageWith("ember"))).toBe("neo");
  });

  it("recognizes only known looks", () => {
    expect(isAppearanceLook("neo")).toBe(true);
    expect(isAppearanceLook("default")).toBe(true);
    expect(isAppearanceLook("Neo")).toBe(false);
    expect(isAppearanceLook(undefined)).toBe(false);
  });

  it("tags the root for Neo and clears it for the standard look", () => {
    const root = { dataset: {} as DOMStringMap };
    applyAppearanceLook(root, "neo");
    expect(root.dataset.look).toBe("neo");
    applyAppearanceLook(root, "default");
    expect("look" in root.dataset).toBe(false);
  });
});
