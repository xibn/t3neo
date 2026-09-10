/**
 * The interface "look": a whole-app restyle that goes beyond a theme's
 * palette (typography, shapes, surfaces). Stored per client like the theme,
 * applied as `data-look` on <html> so `looks/*.css` can restyle everything.
 * `index.html` applies the stored value before first paint. Neo is the
 * default for this fork; "default" is the standard upstream interface.
 */

import { useSyncExternalStore } from "react";

export const APPEARANCE_LOOKS = ["neo", "default"] as const;
export type AppearanceLook = (typeof APPEARANCE_LOOKS)[number];

export const APPEARANCE_LOOK_STORAGE_KEY = "t3code:appearance-look";
export const DEFAULT_APPEARANCE_LOOK: AppearanceLook = "neo";

export const APPEARANCE_LOOK_LABELS: Record<AppearanceLook, string> = {
  neo: "Neo",
  default: "Default (Themes)",
};

export function isAppearanceLook(value: unknown): value is AppearanceLook {
  return typeof value === "string" && (APPEARANCE_LOOKS as ReadonlyArray<string>).includes(value);
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Storage blocked by policy or sandboxed iframe.
    return null;
  }
}

export function readStoredAppearanceLook(
  storage: Pick<Storage, "getItem"> | null = safeStorage(),
): AppearanceLook {
  const raw = storage?.getItem(APPEARANCE_LOOK_STORAGE_KEY);
  // "ember" was the look's name before the fork became T3 Neo.
  if (raw === "ember") return "neo";
  return isAppearanceLook(raw) ? raw : DEFAULT_APPEARANCE_LOOK;
}

export function applyAppearanceLook(
  root: Pick<HTMLElement, "dataset">,
  look: AppearanceLook,
): void {
  if (look === "default") {
    delete root.dataset.look;
  } else {
    root.dataset.look = look;
  }
}

let currentLook: AppearanceLook = readStoredAppearanceLook();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setAppearanceLook(look: AppearanceLook): void {
  currentLook = look;
  try {
    safeStorage()?.setItem(APPEARANCE_LOOK_STORAGE_KEY, look);
  } catch {
    // Quota or policy failure: the look still applies for this session.
  }
  if (typeof document !== "undefined") {
    applyAppearanceLook(document.documentElement, look);
  }
  notify();
}

export function subscribeAppearanceLook(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab of the same origin changed the look: follow it.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== APPEARANCE_LOOK_STORAGE_KEY) return;
    const next = readStoredAppearanceLook({ getItem: () => event.newValue });
    if (next === currentLook) return;
    currentLook = next;
    applyAppearanceLook(document.documentElement, next);
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAppearanceLook(): AppearanceLook {
  return useSyncExternalStore(
    subscribeAppearanceLook,
    () => currentLook,
    () => DEFAULT_APPEARANCE_LOOK,
  );
}

/** Test-only: reset the in-memory value from storage. */
export function reloadAppearanceLookForTest(): void {
  currentLook = readStoredAppearanceLook();
  notify();
}
