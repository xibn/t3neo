import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  applyAsciiPetColor,
  clampPetSize,
  clampPetWorkingInterval,
  createMemoryNeoSettingsStorage,
  DEFAULT_NEO_SETTINGS,
  MAX_PET_SIZE,
  MAX_PET_WORKING_INTERVAL_SEC,
  MIN_PET_SIZE,
  MIN_PET_WORKING_INTERVAL_SEC,
  NEO_SETTINGS_STORAGE_KEY,
  readStoredNeoSettings,
  resetNeoSettingsForTest,
  useNeoSettingsStore,
} from "./neoSettings";

describe("neo settings", () => {
  beforeEach(() => {
    resetNeoSettingsForTest();
  });

  it("falls back to defaults for missing or broken storage", () => {
    expect(readStoredNeoSettings({ getItem: () => null })).toEqual(DEFAULT_NEO_SETTINGS);
    expect(readStoredNeoSettings({ getItem: () => "{oops" })).toEqual(DEFAULT_NEO_SETTINGS);
    expect(readStoredNeoSettings({ getItem: () => JSON.stringify({ pet: "dragon" }) })).toEqual(
      DEFAULT_NEO_SETTINGS,
    );
  });

  it("merges partial stored values over the defaults", () => {
    expect(
      readStoredNeoSettings({
        getItem: () => JSON.stringify({ pet: "wukong", usageBadges: false, petSize: 999 }),
      }),
    ).toEqual({
      ...DEFAULT_NEO_SETTINGS,
      pet: "wukong",
      usageBadges: false,
      petSize: MAX_PET_SIZE,
    });
    expect(
      readStoredNeoSettings({
        getItem: () => JSON.stringify({ headerActionsCollapsed: true, headerActionsToggle: false }),
      }),
    ).toMatchObject({ headerActionsCollapsed: true, headerActionsToggle: false });
    expect(DEFAULT_NEO_SETTINGS.headerActionsToggle).toBe(true);
    expect(DEFAULT_NEO_SETTINGS.headerActionsCollapsed).toBe(false);
  });

  it("reads the agent controls style and falls back to top bar pills", () => {
    expect(
      readStoredNeoSettings({ getItem: () => JSON.stringify({ agentControlsStyle: "default" }) })
        .agentControlsStyle,
    ).toBe("default");
    expect(readStoredNeoSettings({ getItem: () => "{}" }).agentControlsStyle).toBe("topbar");
    expect(
      readStoredNeoSettings({ getItem: () => JSON.stringify({ agentControlsStyle: "glass" }) }),
    ).toEqual(DEFAULT_NEO_SETTINGS);
  });

  it("reads the ASCII pet color and rejects unknown values", () => {
    expect(
      readStoredNeoSettings({ getItem: () => JSON.stringify({ asciiPetColor: "light" }) })
        .asciiPetColor,
    ).toBe("light");
    expect(
      readStoredNeoSettings({ getItem: () => JSON.stringify({ asciiPetColor: "neon" }) }),
    ).toEqual(DEFAULT_NEO_SETTINGS);
  });

  it("publishes the ASCII pet color on the root and clears it for system", () => {
    const root = { dataset: {} as DOMStringMap };
    applyAsciiPetColor(root, "dark");
    expect(root.dataset.neoAsciiColor).toBe("dark");
    applyAsciiPetColor(root, "system");
    expect(root.dataset.neoAsciiColor).toBeUndefined();
  });

  it("clamps the pet size", () => {
    expect(clampPetSize(1)).toBe(MIN_PET_SIZE);
    expect(clampPetSize(10_000)).toBe(MAX_PET_SIZE);
    expect(clampPetSize(Number.NaN)).toBe(DEFAULT_NEO_SETTINGS.petSize);
    expect(clampPetSize(200.4)).toBe(200);
  });

  it("clamps the working animation interval to whole seconds in range", () => {
    expect(clampPetWorkingInterval(0)).toBe(MIN_PET_WORKING_INTERVAL_SEC);
    expect(clampPetWorkingInterval(99)).toBe(MAX_PET_WORKING_INTERVAL_SEC);
    expect(clampPetWorkingInterval(Number.NaN)).toBe(DEFAULT_NEO_SETTINGS.petWorkingIntervalSec);
    expect(clampPetWorkingInterval(7.6)).toBe(8);
    expect(
      readStoredNeoSettings({ getItem: () => JSON.stringify({ petWorkingIntervalSec: 1 }) })
        .petWorkingIntervalSec,
    ).toBe(MIN_PET_WORKING_INTERVAL_SEC);
  });

  it("persists updates", () => {
    const storage = createMemoryNeoSettingsStorage();
    resetNeoSettingsForTest(storage);
    useNeoSettingsStore.getState().update({ queueMessages: false, pet: "rabbit" });
    expect(JSON.parse(storage.getItem(NEO_SETTINGS_STORAGE_KEY) ?? "{}")).toMatchObject({
      queueMessages: false,
      pet: "rabbit",
    });
    resetNeoSettingsForTest(storage);
    expect(useNeoSettingsStore.getState().settings.pet).toBe("rabbit");
  });
});
