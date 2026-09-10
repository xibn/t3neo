import type { DesktopUpdateChannel } from "@t3tools/contracts";

// Upstream nightlies are X.Y.Z-nightly.<date>.<run>; T3 Neo rebuilds of them
// are X.Y.Z-nightly.neo.<date>.<run>. "nightly" stays the first pre-release word
// because electron-updater reads the update channel from it.
const NIGHTLY_VERSION_PATTERN = /-nightly\.(?:neo\.)?\d{8}\.\d+$/;

export function isNightlyDesktopVersion(version: string): boolean {
  return NIGHTLY_VERSION_PATTERN.test(version);
}

export function resolveDefaultDesktopUpdateChannel(appVersion: string): DesktopUpdateChannel {
  return isNightlyDesktopVersion(appVersion) ? "nightly" : "latest";
}
