/**
 * Where this fork lives on GitHub. The release workflow injects the real
 * slug at build time (VITE_T3NEO_REPOSITORY = GITHUB_REPOSITORY); local
 * builds fall back to the default below.
 */

export const NEO_PRODUCT_NAME = "T3 Neo";

const DEFAULT_NEO_REPOSITORY = "xibn/t3neo";

function readConfiguredRepository(): string {
  const configured = import.meta.env.VITE_T3NEO_REPOSITORY?.trim();
  return configured && /^[\w.-]+\/[\w.-]+$/.test(configured) ? configured : DEFAULT_NEO_REPOSITORY;
}

export const NEO_REPOSITORY = readConfiguredRepository();
export const NEO_REPOSITORY_URL = `https://github.com/${NEO_REPOSITORY}`;
export const NEO_RELEASES_URL = `${NEO_REPOSITORY_URL}/releases`;
export const NEO_LATEST_RELEASE_URL = `${NEO_REPOSITORY_URL}/releases/latest`;
export const NEO_LATEST_RELEASE_API_URL = `https://api.github.com/repos/${NEO_REPOSITORY}/releases/latest`;

export function neoReleaseTagUrl(version: string): string {
  const tag = version.startsWith("v") ? version : `v${version}`;
  return `${NEO_REPOSITORY_URL}/releases/tag/${encodeURIComponent(tag)}`;
}

export type NeoDownloadPlatform = "mac-arm64" | "mac-x64" | "linux" | "windows" | "unknown";

export const NEO_DOWNLOAD_PLATFORM_LABELS: Record<NeoDownloadPlatform, string> = {
  "mac-arm64": "macOS (Apple silicon)",
  "mac-x64": "macOS (Intel)",
  linux: "Linux",
  windows: "Windows",
  unknown: "your platform",
};

/**
 * Best-effort platform detection from the browser. Electron exposes its real
 * arch through the bridge; browsers only hint at it through the UA string.
 */
export function detectNeoDownloadPlatform(input: {
  readonly platform: string;
  readonly userAgent: string;
  readonly desktopArch?: string | null;
}): NeoDownloadPlatform {
  const platform = input.platform.toLowerCase();
  const userAgent = input.userAgent.toLowerCase();
  if (platform.startsWith("win") || userAgent.includes("windows")) return "windows";
  if (platform.startsWith("linux") || userAgent.includes("linux")) return "linux";
  if (platform.startsWith("mac") || userAgent.includes("mac os")) {
    if (input.desktopArch === "arm64") return "mac-arm64";
    if (input.desktopArch === "x64") return "mac-x64";
    // Browsers report Intel for Apple silicon Macs; assume arm64 for a modern Mac.
    return userAgent.includes("intel") && !("ontouchend" in globalThis) ? "mac-arm64" : "mac-arm64";
  }
  return "unknown";
}

export interface NeoReleaseAsset {
  readonly name: string;
  readonly browser_download_url: string;
  readonly size?: number;
}

/** Picks the release asset the workflow publishes for a platform. */
export function pickNeoReleaseAsset(
  assets: ReadonlyArray<NeoReleaseAsset>,
  platform: NeoDownloadPlatform,
): NeoReleaseAsset | null {
  const matches = (test: (name: string) => boolean) =>
    assets.find((asset) => test(asset.name.toLowerCase())) ?? null;
  switch (platform) {
    case "mac-arm64":
      return matches((name) => name.endsWith(".dmg") && name.includes("arm64"));
    case "mac-x64":
      return matches((name) => name.endsWith(".dmg") && name.includes("x64"));
    case "linux":
      return matches((name) => name.endsWith(".appimage"));
    case "windows":
      return matches((name) => name.endsWith(".exe"));
    case "unknown":
      return null;
  }
}
