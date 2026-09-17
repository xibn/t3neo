import JSZip from "jszip";
import { describe, expect, it } from "vite-plus/test";

import {
  downloadGalleryPet,
  filterGalleryPets,
  galleryCategories,
  loadGalleryCatalog,
  loadGalleryPage,
  openpetsPageUrl,
  parseCodexPetComReadme,
  parseCodexpetsOrgCatalog,
  parseCodexpetTopCatalog,
  parseOpenpetsPage,
  PET_GALLERIES,
  petGallery,
} from "./petGalleries";

const codexpetTopRaw = [
  {
    slug: "march-7th--legeling",
    name: "三月七",
    localized_names: { en: "March 7th", zh: "三月七" },
    author: "legeling",
    author_handle: "legeling",
    primary_category: "Game Characters",
    collections: [],
    license: "Non-commercial",
    description: "A pink-haired photographer.",
    spriteVersionNumber: 2,
  },
  {
    slug: "om-nom--kasyan1337",
    name: "Om Nom",
    author: "kasyan1337",
    primary_category: "Mascots",
    collections: [],
    license: "MIT",
  },
];

describe("petGallery", () => {
  it("lists four galleries with a site and a repository each", () => {
    expect(PET_GALLERIES.map((entry) => entry.host)).toEqual([
      "codexpet.top",
      "codex-pet.com",
      "codexpets.org",
      "openpets.sh",
    ]);
    for (const entry of PET_GALLERIES) {
      expect(entry.siteUrl).toBe(`https://${entry.host}`);
      expect(entry.repositoryUrl).toBe(`https://github.com/${entry.repository}`);
    }
    expect(petGallery("openpets-sh").mode).toBe("api");
    expect(petGallery("openpets-sh").needsDesktop).toBe(true);
    // Only the hand-drawn gallery carries the award.
    expect(PET_GALLERIES.filter((entry) => entry.award !== null).map((entry) => entry.id)).toEqual([
      "codexpet-top",
    ]);
    expect(petGallery("codexpet-top").award).toBe("High-Quality Designs");
  });
});

describe("parseCodexpetTopCatalog", () => {
  it("prefers the English name, keeps every name for search, files from GitHub", () => {
    const pets = parseCodexpetTopCatalog(codexpetTopRaw);
    expect(pets.map((pet) => pet.name)).toEqual(["March 7th", "Om Nom"]);
    expect(pets[0]!.names).toEqual(["三月七", "March 7th"]);
    expect(pets[0]!.spriteVersion).toBe(2);
    expect(pets[1]!.spriteVersion).toBe(1);
    expect(pets[1]!.download).toEqual({
      kind: "spritesheet",
      url: "https://raw.githubusercontent.com/legeling/awesome-codex-pet/main/pets/om-nom--kasyan1337/spritesheet.webp",
    });
    expect(pets[1]!.preview).toEqual({
      kind: "image",
      url: "https://codexpet.top/assets/previews/om-nom--kasyan1337/thumbnail.webp",
      animationUrl: "https://codexpet.top/assets/previews/om-nom--kasyan1337/webp/idle.webp",
    });
    expect(pets[1]!.sourceUrl).toBe(
      "https://github.com/legeling/awesome-codex-pet/tree/main/pets/om-nom--kasyan1337",
    );
  });

  it("rejects a catalog without the fields the cards need", () => {
    expect(() => parseCodexpetTopCatalog([{ slug: "x" }])).toThrow();
  });
});

describe("parseCodexPetComReadme", () => {
  const readme = `
## Gallery

| a | b |
| <a href="https://codex-pet.com/pets/ada-lovelace"><img src="pets/ada-lovelace/thumb.webp" width="120" alt="Ada Lovelace"><br><sub><b>Ada</b></sub></a> | <a href="https://codex-pet.com/pets/tom-jerry"><img src="pets/tom-jerry/thumb.webp" width="120" alt="Tom &amp; Jerry"></a> |
| <a href="https://codex-pet.com/pets/ada-lovelace"><img src="pets/ada-lovelace/thumb.webp" width="120" alt="Ada Lovelace"></a> |
`;

  it("reads slug, thumbnail and name from the gallery table once per pet", () => {
    const pets = parseCodexPetComReadme(readme);
    expect(pets.map((pet) => pet.slug)).toEqual(["ada-lovelace", "tom-jerry"]);
    expect(pets[1]!.name).toBe("Tom & Jerry");
    expect(pets[0]!.preview).toEqual({
      kind: "image",
      url: "https://raw.githubusercontent.com/BeiXiao/awesome-codex-pets/main/pets/ada-lovelace/thumb.webp",
      animationUrl: null,
    });
    expect(pets[0]!.download).toEqual({
      kind: "zip",
      url: "https://codex-pet.com/api/download/ada-lovelace",
    });
    expect(pets[0]!.spritesheetUrl).toBeNull();
    expect(pets[0]!.author).toBeNull();
  });
});

describe("parseCodexpetsOrgCatalog", () => {
  it("uses the site's spritesheet and the kind as category", () => {
    const pets = parseCodexpetsOrgCatalog([
      {
        id: "tater",
        displayName: "Tater",
        description: "A potato.",
        author: "Alex",
        kind: "creature",
        tags: ["starter", "pixel"],
        pageUrl: "https://codexpets.org/pets/tater",
        spritesheetUrl: "https://codexpets.org/pets/tater/spritesheet.webp",
      },
    ]);
    expect(pets[0]).toMatchObject({
      gallery: "codexpets-org",
      name: "Tater",
      names: ["Tater", "starter", "pixel"],
      author: "Alex",
      category: "creature",
      preview: null,
      spritesheetUrl: "https://codexpets.org/pets/tater/spritesheet.webp",
      download: { kind: "spritesheet", url: "https://codexpets.org/pets/tater/spritesheet.webp" },
      sourceUrl: "https://github.com/eyichan/awesome-codex-pets/tree/main/pets/tater",
    });
  });
});

describe("openpets", () => {
  it("builds page URLs with the site's own search and kind filters", () => {
    expect(openpetsPageUrl({ query: "", category: null }, 1)).toBe(
      "https://openpets.sh/api/pets?page=1&pageSize=30",
    );
    expect(openpetsPageUrl({ query: " cat ", category: "animal" }, 3)).toBe(
      "https://openpets.sh/api/pets?page=3&pageSize=30&q=cat&kind=animal",
    );
  });

  it("parses a page, resolving relative URLs and the sheet version", () => {
    const page = parseOpenpetsPage({
      page: 2,
      pageSize: 30,
      total: 100,
      totalPages: 4,
      pets: [
        {
          id: "jordan",
          displayName: "Jordan",
          kind: "person",
          ownerName: "videokid",
          tags: ["mascot"],
          previewUrl: "/api/pets/jordan/preview",
          spritesheetUrl: "/api/pets/jordan/spritesheet",
          validationReport: { spriteVersionNumber: 2 },
        },
      ],
    });
    expect(page.total).toBe(100);
    expect(page.hasMore).toBe(true);
    expect(page.pets[0]).toMatchObject({
      gallery: "openpets-sh",
      author: "videokid",
      category: "person",
      spriteVersion: 2,
      preview: { kind: "strip", url: "https://openpets.sh/api/pets/jordan/preview" },
      spritesheetUrl: "https://openpets.sh/api/pets/jordan/spritesheet",
      pageUrl: "https://openpets.sh/pets/jordan",
    });
    expect(parseOpenpetsPage({ page: 4, total: 100, totalPages: 4, pets: [] }).hasMore).toBe(false);
  });
});

describe("filterGalleryPets", () => {
  const pets = parseCodexpetTopCatalog(codexpetTopRaw);

  it("matches any name, the author and the category, ignoring case", () => {
    expect(filterGalleryPets(pets, "march", null).map((pet) => pet.slug)).toEqual([
      "march-7th--legeling",
    ]);
    expect(filterGalleryPets(pets, "三月", null)).toHaveLength(1);
    expect(filterGalleryPets(pets, "KASYAN", null).map((pet) => pet.slug)).toEqual([
      "om-nom--kasyan1337",
    ]);
    expect(filterGalleryPets(pets, "mascots", null)).toHaveLength(1);
  });

  it("needs every word to match and combines with the category", () => {
    expect(filterGalleryPets(pets, "march legeling", null)).toHaveLength(1);
    expect(filterGalleryPets(pets, "march kasyan", null)).toHaveLength(0);
    expect(filterGalleryPets(pets, "", "Mascots").map((pet) => pet.slug)).toEqual([
      "om-nom--kasyan1337",
    ]);
    expect(filterGalleryPets(pets, "   ", null)).toHaveLength(2);
    expect(galleryCategories([...pets, ...pets])).toEqual(["Game Characters", "Mascots"]);
  });
});

describe("loadGalleryCatalog / loadGalleryPage", () => {
  it("fetches each catalog gallery from its GitHub repository", async () => {
    const urls: string[] = [];
    const fetchFn = async (url: string) => {
      urls.push(url);
      if (url.endsWith("/README.md")) {
        return new Response(
          '<a href="https://codex-pet.com/pets/x"><img src="pets/x/thumb.webp" width="120" alt="X">',
        );
      }
      if (url.includes("/eyichan/")) {
        return new Response(
          JSON.stringify([
            { id: "t", displayName: "T", spritesheetUrl: "https://codexpets.org/t" },
          ]),
        );
      }
      return new Response(JSON.stringify(codexpetTopRaw));
    };
    expect(await loadGalleryCatalog("codexpet-top", fetchFn)).toHaveLength(2);
    expect(await loadGalleryCatalog("codex-pet-com", fetchFn)).toHaveLength(1);
    expect(await loadGalleryCatalog("codexpets-org", fetchFn)).toHaveLength(1);
    expect(urls).toEqual([
      "https://raw.githubusercontent.com/legeling/awesome-codex-pet/main/pets.json",
      "https://raw.githubusercontent.com/BeiXiao/awesome-codex-pets/main/README.md",
      "https://raw.githubusercontent.com/eyichan/awesome-codex-pets/main/pets.json",
    ]);
    await expect(loadGalleryCatalog("openpets-sh", fetchFn)).rejects.toThrow();
  });

  it("fails on a bad status and pages the api gallery", async () => {
    await expect(
      loadGalleryCatalog("codexpet-top", async () => new Response("nope", { status: 500 })),
    ).rejects.toThrow(/500/);
    const page = await loadGalleryPage(
      "openpets-sh",
      { query: "cat", category: null },
      2,
      async (url) => {
        expect(url).toBe("https://openpets.sh/api/pets?page=2&pageSize=30&q=cat");
        return new Response(JSON.stringify({ page: 2, total: 0, totalPages: 2, pets: [] }));
      },
    );
    expect(page.hasMore).toBe(false);
  });
});

describe("downloadGalleryPet", () => {
  const sheet = {
    download: { kind: "spritesheet" as const, url: "https://x/s.webp" },
    spriteVersion: 1 as const,
  };
  const okFetch = async () => new Response(new Blob([new Uint8Array(16)]), { status: 200 });

  it("takes the version from the decoded image, not the catalog", async () => {
    const result = await downloadGalleryPet(sheet, okFetch, async () => ({
      width: 1536,
      height: 2288,
    }));
    expect(result.spriteVersion).toBe(2);
    expect(result.blob.size).toBe(16);
  });

  it("falls back to the catalog version, then v1, when the image cannot be measured", async () => {
    expect((await downloadGalleryPet(sheet, okFetch, async () => null)).spriteVersion).toBe(1);
    expect(
      (await downloadGalleryPet({ ...sheet, spriteVersion: null }, okFetch, async () => null))
        .spriteVersion,
    ).toBe(1);
  });

  it("unpacks the spritesheet from a zip download", async () => {
    const zip = new JSZip();
    zip.file("acidling/pet.json", "{}");
    zip.file("acidling/spritesheet.webp", new Uint8Array([9, 8, 7]));
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const result = await downloadGalleryPet(
      {
        download: { kind: "zip", url: "https://codex-pet.com/api/download/acidling" },
        spriteVersion: null,
      },
      async () => new Response(new Blob([Uint8Array.from(bytes)]), { status: 200 }),
      async () => null,
    );
    expect(result.blob.size).toBe(3);
    const empty = await new JSZip().file("readme.txt", "x").generateAsync({ type: "uint8array" });
    await expect(
      downloadGalleryPet(
        {
          download: { kind: "zip", url: "https://codex-pet.com/api/download/x" },
          spriteVersion: null,
        },
        async () => new Response(new Blob([Uint8Array.from(empty)]), { status: 200 }),
        async () => null,
      ),
    ).rejects.toThrow(/no spritesheet/);
  });

  it("rejects images that are not pet sheets and failed downloads", async () => {
    await expect(
      downloadGalleryPet(sheet, okFetch, async () => ({ width: 100, height: 100 })),
    ).rejects.toThrow(/not a Codex pet sheet/);
    await expect(
      downloadGalleryPet(sheet, async () => new Response(null, { status: 404 })),
    ).rejects.toThrow(/404/);
    await expect(
      downloadGalleryPet(
        sheet,
        async () => new Response(new Blob([]), { status: 200 }),
        async () => null,
      ),
    ).rejects.toThrow(/empty/);
  });
});
