import { beforeEach, describe, expect, it } from "vite-plus/test";

import { isPetId, readStoredNeoSettings, resetNeoSettingsForTest } from "../neoSettings";
import {
  IMPORTED_PETS_STORAGE_KEY,
  isImportedPetId,
  normalizeImportedPetName,
  readStoredImportedPets,
  resetImportedPetsForTest,
  useImportedPetsStore,
  type ImportedPet,
} from "./importedPets";

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (name: string) => store.get(name) ?? null,
    setItem: (name: string, value: string) => {
      store.set(name, value);
    },
  };
}

const pet: ImportedPet = {
  id: "import:abc",
  name: "Om Nom",
  spriteVersion: 1,
  source: { slug: "om-nom--kasyan1337", name: "Om Nom", author: "kasyan1337" },
  importedAt: 1,
};

describe("imported pet ids", () => {
  it("are their own kind of pet id next to the built-in ones", () => {
    expect(isImportedPetId("import:abc")).toBe(true);
    expect(isImportedPetId("import:")).toBe(false);
    expect(isImportedPetId("wukong")).toBe(false);
    expect(isPetId("import:abc")).toBe(true);
    expect(isPetId("wukong")).toBe(true);
    expect(isPetId("dragon")).toBe(false);
  });

  it("survive a settings round trip, while unknown pets fall back to none", () => {
    const storage = memoryStorage();
    storage.setItem("t3code:neo-settings:v1", JSON.stringify({ pet: "import:abc" }));
    expect(readStoredNeoSettings(storage).pet).toBe("import:abc");
    storage.setItem("t3code:neo-settings:v1", JSON.stringify({ pet: "dragon" }));
    expect(readStoredNeoSettings(storage).pet).toBe("none");
    resetNeoSettingsForTest();
  });
});

describe("normalizeImportedPetName", () => {
  it("trims, collapses spaces, caps the length and falls back when empty", () => {
    expect(normalizeImportedPetName("  Om   Nom ", "x")).toBe("Om Nom");
    expect(normalizeImportedPetName("   ", "Fallback")).toBe("Fallback");
    expect(normalizeImportedPetName("a".repeat(80), "x")).toHaveLength(40);
  });
});

describe("useImportedPetsStore", () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
    resetImportedPetsForTest(storage);
  });

  it("adds, renames and removes pets and persists each step", () => {
    const store = useImportedPetsStore.getState();
    store.add(pet);
    expect(readStoredImportedPets(storage)).toEqual([pet]);
    useImportedPetsStore.getState().rename(pet.id, "  Nommy ");
    expect(readStoredImportedPets(storage)[0]?.name).toBe("Nommy");
    useImportedPetsStore.getState().rename(pet.id, "");
    expect(readStoredImportedPets(storage)[0]?.name).toBe("Om Nom");
    useImportedPetsStore.getState().remove(pet.id);
    expect(readStoredImportedPets(storage)).toEqual([]);
  });

  it("keeps the same gallery pet imported twice as two pets", () => {
    useImportedPetsStore.getState().add(pet);
    useImportedPetsStore.getState().add({ ...pet, id: "import:def" });
    expect(useImportedPetsStore.getState().pets.map((entry) => entry.id)).toEqual([
      "import:abc",
      "import:def",
    ]);
  });

  it("drops entries it cannot read instead of losing the list", () => {
    storage.setItem(
      IMPORTED_PETS_STORAGE_KEY,
      JSON.stringify([pet, { id: "broken", name: "x", spriteVersion: 1 }]),
    );
    expect(readStoredImportedPets(storage)).toEqual([]);
    storage.setItem(IMPORTED_PETS_STORAGE_KEY, JSON.stringify([pet, { ...pet, id: "nope" }]));
    expect(readStoredImportedPets(storage)).toEqual([pet]);
    storage.setItem(IMPORTED_PETS_STORAGE_KEY, "{not json");
    expect(readStoredImportedPets(storage)).toEqual([]);
  });
});
