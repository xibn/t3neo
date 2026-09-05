/**
 * Chevron animations (Settings → Appearance): a vertical chevron inside a
 * popup trigger points away from the side its popup opens on and turns to face
 * the popup while it is open. Stored per client like the look, applied as
 * `data-chevron-animations="off"` on <html> when disabled (on is the default
 * and needs no attribute, so a fresh client never flips at mount).
 * `index.html` applies the stored value before first paint. The CSS lives in
 * `neo/neo.css`; the trigger learns its popup side from
 * `components/ui/popupSide.tsx`.
 */

import { useSyncExternalStore } from "react";

export const CHEVRON_ANIMATIONS_STORAGE_KEY = "t3code:chevron-animations";
export const DEFAULT_CHEVRON_ANIMATIONS = true;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStoredChevronAnimations(
  storage: Pick<Storage, "getItem"> | null = safeStorage(),
): boolean {
  return storage?.getItem(CHEVRON_ANIMATIONS_STORAGE_KEY) !== "off";
}

export function applyChevronAnimations(root: Pick<HTMLElement, "dataset">, enabled: boolean): void {
  if (enabled) {
    delete root.dataset.chevronAnimations;
  } else {
    root.dataset.chevronAnimations = "off";
  }
}

let current: boolean = readStoredChevronAnimations();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setChevronAnimations(enabled: boolean): void {
  current = enabled;
  try {
    safeStorage()?.setItem(CHEVRON_ANIMATIONS_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Quota or policy failure: the choice still applies for this session.
  }
  if (typeof document !== "undefined") {
    applyChevronAnimations(document.documentElement, enabled);
  }
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== CHEVRON_ANIMATIONS_STORAGE_KEY) return;
    const next = readStoredChevronAnimations({ getItem: () => event.newValue });
    if (next === current) return;
    current = next;
    applyChevronAnimations(document.documentElement, next);
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useChevronAnimations(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_CHEVRON_ANIMATIONS,
  );
}
