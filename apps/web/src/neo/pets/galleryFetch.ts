/**
 * GET for pet gallery URLs. On desktop the request goes through the main
 * process, which sends no Origin header: some galleries refuse cross-origin
 * requests, and the app's own scheme is always cross-origin to them. In a
 * browser it is a plain fetch, which works for the galleries that allow it.
 */
export type GalleryFetch = (url: string) => Promise<Response>;

export function galleryFetchAvailable(): boolean {
  return typeof window !== "undefined" && window.desktopBridge?.pet?.fetchGallery !== undefined;
}

export const galleryFetch: GalleryFetch = async (url) => {
  const bridge =
    typeof window !== "undefined" ? window.desktopBridge?.pet?.fetchGallery : undefined;
  if (!bridge) return fetch(url, { cache: "no-cache" });
  const result = await bridge(url);
  // A copy onto a plain ArrayBuffer: the bridge's bytes may sit on a shared buffer.
  return new Response(new Blob([Uint8Array.from(result.body)]), {
    status: result.status,
    headers: result.contentType ? { "content-type": result.contentType } : {},
  });
};
