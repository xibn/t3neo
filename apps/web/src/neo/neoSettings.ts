/**
 * Fork-only preferences (Settings → Neo). Client-local like the look and the
 * message queue: nothing here crosses the wire or touches the server.
 */

import * as Schema from "effect/Schema";
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

const PetPosition = Schema.Struct({ x: Schema.Number, y: Schema.Number });
export type PetPosition = typeof PetPosition.Type;

const NeoSettingsSchema = Schema.Struct({
  /** Show what each turn cost under the assistant's reply. */
  usageBadges: Schema.optionalKey(Schema.Boolean),
  /** Queue messages behind a running turn instead of steering it. */
  queueMessages: Schema.optionalKey(Schema.Boolean),
  /** Ask for confirmation in a popover before discarding a queued message. */
  queueDiscardConfirm: Schema.optionalKey(Schema.Boolean),
  /** A built-in id or an imported pet's id; anything unknown falls back to no pet. */
  pet: Schema.optionalKey(Schema.String),
  petSize: Schema.optionalKey(Schema.Number),
  petPosition: Schema.optionalKey(Schema.NullOr(PetPosition)),
  /** Seconds between Wukong's working animations. */
  petWorkingIntervalSec: Schema.optionalKey(Schema.Number),
  asciiPetColor: Schema.optionalKey(Schema.Literals(ASCII_PET_COLORS)),
  /** Keep the composer open at eight lines instead of growing from one. */
  composerExpanded: Schema.optionalKey(Schema.Boolean),
  /** Show the header button that folds the chat header's actions away. */
  headerActionsToggle: Schema.optionalKey(Schema.Boolean),
  /** Whether the chat header's actions are folded away right now. */
  headerActionsCollapsed: Schema.optionalKey(Schema.Boolean),
  /** Where the branch manager (workspace + branch) lives. */
  branchToolbarPosition: Schema.optionalKey(Schema.Literals(["composer", "header"])),
  /** Show the pill that moves the branch manager between composer and header. */
  branchToolbarMoveButton: Schema.optionalKey(Schema.Boolean),
  /** Which context-window option a new chat picks when the model offers a choice. */
  defaultContextWindow: Schema.optionalKey(Schema.Literals(["biggest", "smallest"])),
  /** Whether a new chat turns the model's fast mode on ("fastest") or off ("slowest"). */
  defaultFastMode: Schema.optionalKey(Schema.Literals(["fastest", "slowest"])),
  /** How the composer's model, traits and mode controls look (Settings → Appearance). */
  agentControlsStyle: Schema.optionalKey(Schema.Literals(["topbar", "default"])),
});

export type NeoContextWindowDefault = "biggest" | "smallest";
export type NeoFastModeDefault = "fastest" | "slowest";

/** "topbar" borrows the header's bordered pills; "default" keeps upstream's ghost buttons. */
export type AgentControlsStyle = "topbar" | "default";
export const AGENT_CONTROLS_STYLE_LABELS: Record<AgentControlsStyle, string> = {
  topbar: "Top bar style",
  default: "Default style",
};

export type BranchToolbarPosition = "composer" | "header";

export interface NeoSettings {
  readonly usageBadges: boolean;
  readonly queueMessages: boolean;
  readonly queueDiscardConfirm: boolean;
  readonly pet: PetId;
  readonly petSize: number;
  /** Viewport offset of the floating pet; null keeps it docked bottom-left. */
  readonly petPosition: PetPosition | null;
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
  petPosition: null,
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

const decodeStored = Schema.decodeUnknownSync(NeoSettingsSchema);

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

export function readStoredNeoSettings(
  storage: Pick<NeoSettingsStorage, "getItem"> = baseStorage,
): NeoSettings {
  try {
    const raw = storage.getItem(NEO_SETTINGS_STORAGE_KEY);
    if (typeof raw !== "string" || raw.length === 0) return DEFAULT_NEO_SETTINGS;
    const stored = decodeStored(JSON.parse(raw));
    return {
      usageBadges: stored.usageBadges ?? DEFAULT_NEO_SETTINGS.usageBadges,
      queueMessages: stored.queueMessages ?? DEFAULT_NEO_SETTINGS.queueMessages,
      queueDiscardConfirm: stored.queueDiscardConfirm ?? DEFAULT_NEO_SETTINGS.queueDiscardConfirm,
      pet: isPetId(stored.pet) ? stored.pet : DEFAULT_NEO_SETTINGS.pet,
      petSize: clampPetSize(stored.petSize ?? DEFAULT_NEO_SETTINGS.petSize),
      petPosition: stored.petPosition ?? null,
      petWorkingIntervalSec: clampPetWorkingInterval(
        stored.petWorkingIntervalSec ?? DEFAULT_NEO_SETTINGS.petWorkingIntervalSec,
      ),
      asciiPetColor: stored.asciiPetColor ?? DEFAULT_NEO_SETTINGS.asciiPetColor,
      composerExpanded: stored.composerExpanded ?? DEFAULT_NEO_SETTINGS.composerExpanded,
      headerActionsToggle: stored.headerActionsToggle ?? DEFAULT_NEO_SETTINGS.headerActionsToggle,
      headerActionsCollapsed:
        stored.headerActionsCollapsed ?? DEFAULT_NEO_SETTINGS.headerActionsCollapsed,
      branchToolbarPosition:
        stored.branchToolbarPosition ?? DEFAULT_NEO_SETTINGS.branchToolbarPosition,
      branchToolbarMoveButton:
        stored.branchToolbarMoveButton ?? DEFAULT_NEO_SETTINGS.branchToolbarMoveButton,
      defaultContextWindow:
        stored.defaultContextWindow ?? DEFAULT_NEO_SETTINGS.defaultContextWindow,
      defaultFastMode: stored.defaultFastMode ?? DEFAULT_NEO_SETTINGS.defaultFastMode,
      agentControlsStyle: stored.agentControlsStyle ?? DEFAULT_NEO_SETTINGS.agentControlsStyle,
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
