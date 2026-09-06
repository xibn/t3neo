import { useEffect } from "react";

import { useNeoSettings } from "../neoSettings";

/**
 * Desktop only: the pet lives in its own window, never inside the app.
 * Picking a pet opens that window (or leaves it open), "No pet" closes it.
 * The pet window itself reads the same settings, so it swaps pets on its own.
 */
export function usePetWindowSync(enabled: boolean): void {
  const pet = useNeoSettings().pet;
  useEffect(() => {
    const bridge = window.desktopBridge?.pet;
    if (!bridge || !enabled) return;
    if (pet === "none") {
      void bridge.closeWindow();
    } else {
      void bridge.openWindow();
    }
  }, [enabled, pet]);
}
