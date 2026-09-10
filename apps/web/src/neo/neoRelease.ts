import { useEffect, useState } from "react";

import {
  detectNeoDownloadPlatform,
  NEO_LATEST_RELEASE_API_URL,
  pickNeoReleaseAsset,
  type NeoDownloadPlatform,
  type NeoReleaseAsset,
} from "./neoRepository";

export interface NeoLatestRelease {
  readonly tag: string;
  readonly version: string;
  readonly htmlUrl: string;
  readonly publishedAt: string | null;
  readonly assets: ReadonlyArray<NeoReleaseAsset>;
}

export type NeoLatestReleaseState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly release: NeoLatestRelease }
  | { readonly status: "error"; readonly message: string };

let cached: Promise<NeoLatestRelease> | null = null;

function parseRelease(raw: unknown): NeoLatestRelease {
  const record = raw as Record<string, unknown>;
  const tag = typeof record.tag_name === "string" ? record.tag_name : "";
  if (!tag) throw new Error("The latest release has no tag.");
  const assets = Array.isArray(record.assets)
    ? (record.assets as Array<Record<string, unknown>>).flatMap((asset) =>
        typeof asset.name === "string" && typeof asset.browser_download_url === "string"
          ? [
              {
                name: asset.name,
                browser_download_url: asset.browser_download_url,
                ...(typeof asset.size === "number" ? { size: asset.size } : {}),
              },
            ]
          : [],
      )
    : [];
  return {
    tag,
    version: tag.replace(/^v/, ""),
    htmlUrl: typeof record.html_url === "string" ? record.html_url : "",
    publishedAt: typeof record.published_at === "string" ? record.published_at : null,
    assets,
  };
}

/** Fetches the fork's latest GitHub release once per session. */
export function fetchLatestNeoRelease(): Promise<NeoLatestRelease> {
  cached ??= fetch(NEO_LATEST_RELEASE_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`GitHub responded with ${response.status}.`);
      }
      return parseRelease(await response.json());
    })
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}

export function useLatestNeoRelease(): NeoLatestReleaseState {
  const [state, setState] = useState<NeoLatestReleaseState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetchLatestNeoRelease().then(
      (release) => {
        if (!cancelled) setState({ status: "ready", release });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Could not load the latest release.",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export function currentNeoDownloadPlatform(): NeoDownloadPlatform {
  if (typeof navigator === "undefined") return "unknown";
  const desktopArch = window.desktopBridge?.getClientPlatform?.() ?? null;
  return detectNeoDownloadPlatform({
    platform: navigator.platform ?? "",
    userAgent: navigator.userAgent ?? "",
    desktopArch: desktopArch === "darwin" ? null : desktopArch,
  });
}

export function neoDownloadForCurrentPlatform(release: NeoLatestRelease): {
  readonly platform: NeoDownloadPlatform;
  readonly asset: NeoReleaseAsset | null;
} {
  const platform = currentNeoDownloadPlatform();
  return { platform, asset: pickNeoReleaseAsset(release.assets, platform) };
}
