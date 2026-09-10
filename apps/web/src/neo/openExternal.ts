import { isElectron } from "~/env";

/** Opens a link in the system browser on desktop, in a new tab on the web. */
export function openExternalUrl(url: string): void {
  if (isElectron && window.desktopBridge?.openExternal) {
    void window.desktopBridge.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
