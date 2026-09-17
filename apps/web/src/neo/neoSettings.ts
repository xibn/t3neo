/**
 * Fork-only preferences (Settings → Neo). Client-local like the look and the
 * message queue: nothing here crosses the wire or touches the server.
 */

import { create } from "zustand";

import { isImportedPetId, type ImportedPetId } from "./pets/importedPets";

export const NEO_SETTINGS_STORAGE_KEY = "t3code:neo-settings:v1";

export const PET_IDS = ["none", "rabbit", "wukong", "lunar"] as const;
export type BuiltinPetId = (typeof PET_IDS)[number];
/** A built-in pet, or one imported from the Codex pet gallery (`import:<uuid>`). */
export type PetId = BuiltinPetId | ImportedPetId;

export function isBuiltinPetId(value: unknown): value is BuiltinPetId {
  return typeof value === "string" && (PET_IDS as ReadonlyArray<string>).includes(value);
}

export function isPetId(value: unknown): value is PetId {
  return isBuiltinPetId(value) || isImportedPetId(value);
}

/**
 * Glyph color of the ASCII pets (the "no pet" X and Wukong). "system" follows
 * the light or dark appearance; the other two pin one appearance's color. The
 * colors themselves live in `neo/neo.css` as `--neo-ascii-pet-light/dark`.
 */
export const ASCII_PET_COLORS = ["system", "light", "dark"] as const;
export type AsciiPetColor = (typeof ASCII_PET_COLORS)[number];
export const ASCII_PET_COLOR_LABELS: Record<AsciiPetColor, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export const MIN_PET_SIZE = 32;
export const MAX_PET_SIZE = 360;
export const DEFAULT_PET_SIZE = 160;

/** How often Wukong switches exercise while agents work, in whole seconds. */
export const MIN_PET_WORKING_INTERVAL_SEC = 2;
export const MAX_PET_WORKING_INTERVAL_SEC = 12;
export const DEFAULT_PET_WORKING_INTERVAL_SEC = 6;

/** Which context-window option a new chat picks when the model offers a choice. */
const CONTEXT_WINDOW_DEFAULTS = ["biggest", "smallest"] as const;
export type NeoContextWindowDefault = (typeof CONTEXT_WINDOW_DEFAULTS)[number];
/** Whether a new chat turns the model's fast mode on ("fastest") or off ("slowest"). */
const FAST_MODE_DEFAULTS = ["fastest", "slowest"] as const;
export type NeoFastModeDefault = (typeof FAST_MODE_DEFAULTS)[number];

/** "topbar" borrows the header's bordered pills; "default" keeps upstream's ghost buttons. */
const AGENT_CONTROLS_STYLES = ["topbar", "default"] as const;
export type AgentControlsStyle = (typeof AGENT_CONTROLS_STYLES)[number];
export const AGENT_CONTROLS_STYLE_LABELS: Record<AgentControlsStyle, string> = {
  topbar: "Top bar style",
  default: "Default style",
};

/** Where the branch manager (workspace + branch) lives. */
const BRANCH_TOOLBAR_POSITIONS = ["composer", "header"] as const;
export type BranchToolbarPosition = (typeof BRANCH_TOOLBAR_POSITIONS)[number];

export interface NeoSettings {
  readonly usageBadges: boolean;
  readonly queueMessages: boolean;
  readonly queueDiscardConfirm: boolean;
  readonly pet: PetId;
  readonly petSize: number;
  /** Seconds between Wukong's working animations. */
  readonly petWorkingIntervalSec: number;
  readonly asciiPetColor: AsciiPetColor;
  readonly composerExpanded: boolean;
  readonly headerActionsToggle: boolean;
  readonly headerActionsCollapsed: boolean;
  readonly branchToolbarPosition: BranchToolbarPosition;
  readonly branchToolbarMoveButton: boolean;
  readonly defaultContextWindow: NeoContextWindowDefault;
  readonly defaultFastMode: NeoFastModeDefault;
  readonly agentControlsStyle: AgentControlsStyle;
}

export const DEFAULT_NEO_SETTINGS: NeoSettings = {
  usageBadges: true,
  queueMessages: true,
  queueDiscardConfirm: true,
  pet: "none",
  petSize: DEFAULT_PET_SIZE,
  petWorkingIntervalSec: DEFAULT_PET_WORKING_INTERVAL_SEC,
  asciiPetColor: "system",
  composerExpanded: false,
  headerActionsToggle: true,
  headerActionsCollapsed: false,
  branchToolbarPosition: "composer",
  branchToolbarMoveButton: true,
  defaultContextWindow: "smallest",
  defaultFastMode: "slowest",
  agentControlsStyle: "topbar",
};

/**
 * Publish the ASCII pet color choice as `data-neo-ascii-color` on <html>, where
 * `neo/neo.css` picks the glyph color. "system" removes the attribute so the
 * appearance decides.
 */
export function applyAsciiPetColor(root: Pick<HTMLElement, "dataset">, color: AsciiPetColor): void {
  if (color === "system") {
    delete root.dataset.neoAsciiColor;
  } else {
    root.dataset.neoAsciiColor = color;
  }
}

export function clampPetSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_PET_SIZE;
  return Math.min(MAX_PET_SIZE, Math.max(MIN_PET_SIZE, Math.round(size)));
}

export function clampPetWorkingInterval(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_PET_WORKING_INTERVAL_SEC;
  return Math.min(
    MAX_PET_WORKING_INTERVAL_SEC,
    Math.max(MIN_PET_WORKING_INTERVAL_SEC, Math.round(seconds)),
  );
}

/** The synchronous slice of Storage this store needs. */
export interface NeoSettingsStorage {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
}

export function createMemoryNeoSettingsStorage(): NeoSettingsStorage {
  const store = new Map<string, string>();
  return {
    getItem: (name) => store.get(name) ?? null,
    setItem: (name, value) => {
      store.set(name, value);
    },
  };
}

function resolveBaseStorage(): NeoSettingsStorage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Storage blocked; fall back to memory for the session.
  }
  return createMemoryNeoSettingsStorage();
}

let baseStorage = resolveBaseStorage();

/*
 * Each field is read on its own with its own fallback: a value this build does
 * not know (a newer build's choice after a downgrade, or a hand edit) must not
 * reset every other preference, since the next update persists the whole object.
 */
function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function readChoice<const T extends string>(
  choices: ReadonlyArray<T>,
  value: unknown,
  fallback: T,
): T {
  return typeof value === "string" && (choices as ReadonlyArray<string>).includes(value)
    ? (value as T)
    : fallback;
}

export function readStoredNeoSettings(
  storage: Pick<NeoSettingsStorage, "getItem"> = baseStorage,
): NeoSettings {
  try {
    const raw = storage.getItem(NEO_SETTINGS_STORAGE_KEY);
    if (typeof raw !== "string" || raw.length === 0) return DEFAULT_NEO_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return DEFAULT_NEO_SETTINGS;
    }
    const stored = parsed as Record<string, unknown>;
    const defaults = DEFAULT_NEO_SETTINGS;
    return {
      usageBadges: readBoolean(stored.usageBadges, defaults.usageBadges),
      queueMessages: readBoolean(stored.queueMessages, defaults.queueMessages),
      queueDiscardConfirm: readBoolean(stored.queueDiscardConfirm, defaults.queueDiscardConfirm),
      pet: isPetId(stored.pet) ? stored.pet : defaults.pet,
      petSize: clampPetSize(readNumber(stored.petSize, defaults.petSize)),
      petWorkingIntervalSec: clampPetWorkingInterval(
        readNumber(stored.petWorkingIntervalSec, defaults.petWorkingIntervalSec),
      ),
      asciiPetColor: readChoice(ASCII_PET_COLORS, stored.asciiPetColor, defaults.asciiPetColor),
      composerExpanded: readBoolean(stored.composerExpanded, defaults.composerExpanded),
      headerActionsToggle: readBoolean(stored.headerActionsToggle, defaults.headerActionsToggle),
      headerActionsCollapsed: readBoolean(
        stored.headerActionsCollapsed,
        defaults.headerActionsCollapsed,
      ),
      branchToolbarPosition: readChoice(
        BRANCH_TOOLBAR_POSITIONS,
        stored.branchToolbarPosition,
        defaults.branchToolbarPosition,
      ),
      branchToolbarMoveButton: readBoolean(
        stored.branchToolbarMoveButton,
        defaults.branchToolbarMoveButton,
      ),
      defaultContextWindow: readChoice(
        CONTEXT_WINDOW_DEFAULTS,
        stored.defaultContextWindow,
        defaults.defaultContextWindow,
      ),
      defaultFastMode: readChoice(
        FAST_MODE_DEFAULTS,
        stored.defaultFastMode,
        defaults.defaultFastMode,
      ),
      agentControlsStyle: readChoice(
        AGENT_CONTROLS_STYLES,
        stored.agentControlsStyle,
        defaults.agentControlsStyle,
      ),
    };
  } catch {
    return DEFAULT_NEO_SETTINGS;
  }
}

function persist(settings: NeoSettings): void {
  try {
    baseStorage.setItem(NEO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("[NEO] Could not persist settings.", error);
  }
}

interface NeoSettingsStore {
  settings: NeoSettings;
  update: (patch: Partial<NeoSettings>) => void;
}

export const useNeoSettingsStore = create<NeoSettingsStore>()((set, get) => ({
  settings: readStoredNeoSettings(),
  update: (patch) => {
    const next: NeoSettings = {
      ...get().settings,
      ...patch,
      ...(patch.petSize !== undefined ? { petSize: clampPetSize(patch.petSize) } : {}),
      ...(patch.petWorkingIntervalSec !== undefined
        ? { petWorkingIntervalSec: clampPetWorkingInterval(patch.petWorkingIntervalSec) }
        : {}),
    };
    persist(next);
    set({ settings: next });
  },
}));

/**
 * Adopts what another window of this app wrote (the pet window and the main
 * window share the key), so a pet picked in Settings changes in its window at once.
 */
export function reloadNeoSettingsFromStorage(): void {
  useNeoSettingsStore.setState({ settings: readStoredNeoSettings() });
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === NEO_SETTINGS_STORAGE_KEY)
      reloadNeoSettingsFromStorage();
  });
}

export function useNeoSettings(): NeoSettings {
  return useNeoSettingsStore((state) => state.settings);
}

export function useUpdateNeoSettings(): (patch: Partial<NeoSettings>) => void {
  return useNeoSettingsStore((state) => state.update);
}

/** Test-only: swap the backing storage and reload. */
export function resetNeoSettingsForTest(storage?: NeoSettingsStorage): void {
  baseStorage = storage ?? createMemoryNeoSettingsStorage();
  useNeoSettingsStore.setState({ settings: readStoredNeoSettings() });
}
