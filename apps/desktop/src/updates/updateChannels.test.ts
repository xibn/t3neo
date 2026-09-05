import { describe, expect, it } from "vite-plus/test";

import { isNightlyDesktopVersion, resolveDefaultDesktopUpdateChannel } from "./updateChannels.ts";

describe("updateChannels", () => {
  it("puts upstream and T3 Neo nightly versions on the nightly channel", () => {
    expect(resolveDefaultDesktopUpdateChannel("0.0.39-nightly.20260904.1280")).toBe("nightly");
    expect(resolveDefaultDesktopUpdateChannel("0.0.39-nightly.neo.20260904.1280")).toBe("nightly");
    expect(isNightlyDesktopVersion("0.0.39-nightly.neo.20260904.1280")).toBe(true);
  });

  it("keeps stable and T3 Neo release versions on the latest channel", () => {
    expect(resolveDefaultDesktopUpdateChannel("0.0.39")).toBe("latest");
    expect(resolveDefaultDesktopUpdateChannel("0.0.39-neo.2")).toBe("latest");
    expect(isNightlyDesktopVersion("0.0.39-neo.2")).toBe(false);
  });
});
