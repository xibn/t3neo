/**
 * Pets imported from the Codex pet gallery. Each import is its own copy: the
 * spritesheet lives in IndexedDB under a fresh id and the name and source
 * notes in localStorage, so the same gallery pet can be imported twice and a
 * change upstream never touches what is already here. Both windows of the
 * app share the storage; the `storage` event keeps their lists in step.
 */

import * as Schema from "effect/Schema";
import { useEffect, useState } from "react";
import { create } from "zustand";

import { randomUUID } from "~/lib/utils";
import type { GalleryFetch } from "./galleryFetch";
import { downloadGalleryPet, petGallery, type GalleryPet } from "./petGalleries";
import type { SpriteVersion } from "./spriteSheet";

export const IMPORTED_PETS_STORAGE_KEY = "t3code:neo-imported-pets:v1";
const IMPORTED_PET_ID_PREFIX = "import:";

export type ImportedPetId = `import:${string}`;

export function isImportedPetId(value: unknown): value is ImportedPetId {
  return (
    typeof value === "string" &&
    value.startsWith(IMPORTED_PET_ID_PREFIX) &&
    value.length > IMPORTED_PET_ID_PREFIX.length
  );
}

const ImportedPetSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  spriteVersion: Schema.Literals([1, 2]),
  source: Schema.Struct({
    slug: Schema.String,
    name: Schema.String,
    author: Schema.String,
    gallery: Schema.optionalKey(Schema.String),
  }),
  importedAt: Schema.Number,
});

export interface ImportedPet {
  readonly id: ImportedPetId;
  readonly name: string;
  readonly spriteVersion: SpriteVersion;
  /** Where it came from, for the card; nothing is looked up there again. */
  readonly source: {
    readonly slug: string;
    readonly name: string;
    /** Empty when the gallery names no author. */
    readonly author: string;
    /** The gallery's host name, e.g. "codexpet.top". */
    readonly gallery?: string;
  };
  readonly importedAt: number;
}

const decodeStored = Schema.decodeUnknownSync(Schema.Array(ImportedPetSchema));

export const MAX_IMPORTED_PET_NAME_LENGTH = 40;

export function normalizeImportedPetName(name: string, fallback: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, MAX_IMPORTED_PET_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : fallback;
}

/** The synchronous slice of Storage this store needs. */
interface ImportedPetsStorage {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
}

function createMemoryStorage(): ImportedPetsStorage {
  const store = new Map<string, string>();
  return {
    getItem: (name) => store.get(name) ?? null,
    setItem: (name, value) => {
      store.set(name, value);
    },
  };
}

function resolveBaseStorage(): ImportedPetsStorage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Storage blocked; fall back to memory for the session.
  }
  return createMemoryStorage();
}

let baseStorage = resolveBaseStorage();

export function readStoredImportedPets(
  storage: Pick<ImportedPetsStorage, "getItem"> = baseStorage,
): ImportedPet[] {
  try {
    const raw = storage.getItem(IMPORTED_PETS_STORAGE_KEY);
    if (typeof raw !== "string" || raw.length === 0) return [];
    return decodeStored(JSON.parse(raw)).flatMap((pet) =>
      isImportedPetId(pet.id) ? [{ ...pet, id: pet.id }] : [],
    );
  } catch {
    return [];
  }
}

function persist(pets: ReadonlyArray<ImportedPet>): void {
  try {
    baseStorage.setItem(IMPORTED_PETS_STORAGE_KEY, JSON.stringify(pets));
  } catch (error) {
    console.error("[NEO] Could not persist imported pets.", error);
  }
}

interface ImportedPetsStore {
  pets: ReadonlyArray<ImportedPet>;
  add: (pet: ImportedPet) => void;
  rename: (id: ImportedPetId, name: string) => void;
  remove: (id: ImportedPetId) => void;
}

export const useImportedPetsStore = create<ImportedPetsStore>()((set, get) => ({
  pets: readStoredImportedPets(),
  add: (pet) => {
    const pets = [...get().pets.filter((entry) => entry.id !== pet.id), pet];
    persist(pets);
    set({ pets });
  },
  rename: (id, name) => {
    const pets = get().pets.map((pet) =>
      pet.id === id ? { ...pet, name: normalizeImportedPetName(name, pet.source.name) } : pet,
    );
    persist(pets);
    set({ pets });
  },
  remove: (id) => {
    const pets = get().pets.filter((pet) => pet.id !== id);
    persist(pets);
    set({ pets });
  },
}));

export function reloadImportedPetsFromStorage(): void {
  useImportedPetsStore.setState({ pets: readStoredImportedPets() });
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === IMPORTED_PETS_STORAGE_KEY) {
      reloadImportedPetsFromStorage();
    }
  });
}

export function useImportedPets(): ReadonlyArray<ImportedPet> {
  return useImportedPetsStore((state) => state.pets);
}

export function useImportedPet(id: string): ImportedPet | null {
  return useImportedPetsStore((state) => state.pets.find((pet) => pet.id === id) ?? null);
}

/** Test-only: swap the backing storage and reload. */
export function resetImportedPetsForTest(storage?: ImportedPetsStorage): void {
  baseStorage = storage ?? createMemoryStorage();
  useImportedPetsStore.setState({ pets: readStoredImportedPets() });
}

// ---- Spritesheets (IndexedDB) ----------------------------------------------

const DATABASE_NAME = "t3code:neo-pets";
const DATABASE_VERSION = 1;
const SPRITESHEET_STORE = "spritesheets";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB request failed")),
      { once: true },
    );
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener("upgradeneeded", () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(SPRITESHEET_STORE)) {
      database.createObjectStore(SPRITESHEET_STORE);
    }
  });
  return requestToPromise(request);
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SPRITESHEET_STORE, mode);
    return await requestToPromise(run(transaction.objectStore(SPRITESHEET_STORE)));
  } finally {
    database.close();
  }
}

export function putSpritesheet(id: ImportedPetId, blob: Blob): Promise<unknown> {
  return withStore("readwrite", (store) => store.put(blob, id));
}

export async function getSpritesheet(id: ImportedPetId): Promise<Blob | null> {
  const value = await withStore<unknown>("readonly", (store) => store.get(id));
  return value instanceof Blob ? value : null;
}

export function deleteSpritesheet(id: ImportedPetId): Promise<unknown> {
  return withStore("readwrite", (store) => store.delete(id));
}

/** Object URLs live as long as the window; a handful of sheets is a few megabytes. */
const urlCache = new Map<ImportedPetId, Promise<string | null>>();

function spritesheetUrl(id: ImportedPetId): Promise<string | null> {
  let pending = urlCache.get(id);
  if (!pending) {
    pending = getSpritesheet(id)
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null);
    urlCache.set(id, pending);
  }
  return pending;
}

/** `undefined` while loading, `null` when the sheet is gone. */
export function useSpritesheetUrl(id: ImportedPetId): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setUrl(undefined);
    void spritesheetUrl(id).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return url;
}

function newImportedPetId(): ImportedPetId {
  return `${IMPORTED_PET_ID_PREFIX}${randomUUID()}`;
}

/** Downloads a gallery pet and adds it as a new, independent copy. */
export async function importGalleryPet(
  pet: GalleryPet,
  fetchFn?: GalleryFetch,
): Promise<ImportedPet> {
  const { blob, spriteVersion } = await downloadGalleryPet(pet, fetchFn);
  const id = newImportedPetId();
  await putSpritesheet(id, blob);
  urlCache.set(id, Promise.resolve(URL.createObjectURL(blob)));
  const imported: ImportedPet = {
    id,
    name: normalizeImportedPetName(pet.name, pet.slug),
    spriteVersion,
    source: {
      slug: pet.slug,
      name: pet.name,
      author: pet.author ?? "",
      gallery: petGallery(pet.gallery).host,
    },
    importedAt: Date.now(),
  };
  useImportedPetsStore.getState().add(imported);
  return imported;
}

/** Forgets the pet and its sheet; the caller switches the selection away first if needed. */
export async function removeImportedPet(id: ImportedPetId): Promise<void> {
  useImportedPetsStore.getState().remove(id);
  const cached = urlCache.get(id);
  urlCache.delete(id);
  if (cached) {
    const url = await cached;
    if (url) URL.revokeObjectURL(url);
  }
  try {
    await deleteSpritesheet(id);
  } catch (error) {
    console.error("[NEO] Could not delete the pet spritesheet.", error);
  }
}
