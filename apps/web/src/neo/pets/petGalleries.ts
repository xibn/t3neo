/**
 * The community Codex pet galleries the pet browser can import from. Each
 * gallery is a GitHub repository with a site in front of it. Catalogs and
 * files come from GitHub wherever the repository holds them, so imports keep
 * working even if a site goes away; sites only fill in what the repository
 * does not track (previews, or the files themselves for sites that keep
 * sprites out of git).
 */

import JSZip from "jszip";
import * as Schema from "effect/Schema";

import { galleryFetch, type GalleryFetch } from "./galleryFetch";
import { spriteVersionForSize, type SpriteVersion } from "./spriteSheet";

export type PetGalleryId = "codexpet-top" | "codex-pet-com" | "codexpets-org" | "openpets-sh";

export interface PetGallery {
  readonly id: PetGalleryId;
  readonly host: string;
  readonly siteUrl: string;
  readonly repository: string;
  readonly repositoryUrl: string;
  /** "catalog": one list is fetched and searched here. "api": the site searches and pages. */
  readonly mode: "catalog" | "api";
  /** Fixed category names for "api" galleries; "catalog" galleries derive them from the list. */
  readonly categories: ReadonlyArray<string>;
  /** Only the desktop app can reach it: the site refuses cross-origin requests. */
  readonly needsDesktop: boolean;
}

function gallery(
  id: PetGalleryId,
  host: string,
  repository: string,
  options: Partial<Pick<PetGallery, "mode" | "categories" | "needsDesktop">> = {},
): PetGallery {
  return {
    id,
    host,
    siteUrl: `https://${host}`,
    repository,
    repositoryUrl: `https://github.com/${repository}`,
    mode: options.mode ?? "catalog",
    categories: options.categories ?? [],
    needsDesktop: options.needsDesktop ?? false,
  };
}

export const PET_GALLERIES: ReadonlyArray<PetGallery> = [
  gallery("codexpet-top", "codexpet.top", "legeling/awesome-codex-pet"),
  gallery("codex-pet-com", "codex-pet.com", "BeiXiao/awesome-codex-pets"),
  gallery("codexpets-org", "codexpets.org", "eyichan/awesome-codex-pets"),
  gallery("openpets-sh", "openpets.sh", "alterhq/openpets", {
    mode: "api",
    categories: ["animal", "creature", "person", "object"],
    needsDesktop: true,
  }),
];

export const DEFAULT_PET_GALLERY: PetGalleryId = "codexpet-top";

export function petGallery(id: PetGalleryId): PetGallery {
  return PET_GALLERIES.find((entry) => entry.id === id) ?? PET_GALLERIES[0]!;
}

export function isPetGalleryId(value: unknown): value is PetGalleryId {
  return PET_GALLERIES.some((entry) => entry.id === value);
}

function rawBase(repository: string): string {
  return `https://raw.githubusercontent.com/${repository}/main`;
}

export interface GalleryPet {
  readonly gallery: PetGalleryId;
  readonly slug: string;
  readonly name: string;
  /** Every name the gallery lists, for search. */
  readonly names: ReadonlyArray<string>;
  readonly author: string | null;
  readonly category: string | null;
  readonly description: string | null;
  readonly spriteVersion: SpriteVersion | null;
  /**
   * The card image. "image": a small still, with an animated image for hover
   * when the gallery has one. "strip": every frame side by side at cell size,
   * of which the first shows. Null means cut the first frame from the sheet.
   */
  readonly preview:
    | { readonly kind: "image"; readonly url: string; readonly animationUrl: string | null }
    | { readonly kind: "strip"; readonly url: string }
    | null;
  /** The sheet as a plain image URL for previews; null when it only ships inside a zip. */
  readonly spritesheetUrl: string | null;
  readonly download:
    | { readonly kind: "spritesheet"; readonly url: string }
    | { readonly kind: "zip"; readonly url: string };
  /** The pet on the gallery site. */
  readonly pageUrl: string;
  /** Files and license: the pet's folder in the repository, else its page. */
  readonly sourceUrl: string;
}

// ---- codexpet.top (legeling/awesome-codex-pet) -----------------------------

const CodexpetTopPet = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  localized_names: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  author: Schema.String,
  author_handle: Schema.optionalKey(Schema.String),
  primary_category: Schema.String,
  description: Schema.optionalKey(Schema.String),
  spriteVersionNumber: Schema.optionalKey(Schema.Number),
});
const decodeCodexpetTop = Schema.decodeUnknownSync(Schema.Array(CodexpetTopPet));

export function parseCodexpetTopCatalog(input: unknown): GalleryPet[] {
  const source = petGallery("codexpet-top");
  const raw = rawBase(source.repository);
  return decodeCodexpetTop(input).map((pet) => {
    const localized = pet.localized_names ?? {};
    const slug = encodeURIComponent(pet.slug);
    return {
      gallery: source.id,
      slug: pet.slug,
      name: localized.en ?? pet.name,
      names: [...new Set([pet.name, ...Object.values(localized)].filter(Boolean))],
      author: pet.author,
      category: pet.primary_category,
      description: pet.description ?? null,
      spriteVersion: pet.spriteVersionNumber === 2 ? 2 : 1,
      preview: {
        kind: "image",
        url: `${source.siteUrl}/assets/previews/${slug}/thumbnail.webp`,
        animationUrl: `${source.siteUrl}/assets/previews/${slug}/webp/idle.webp`,
      },
      spritesheetUrl: `${raw}/pets/${slug}/spritesheet.webp`,
      download: { kind: "spritesheet", url: `${raw}/pets/${slug}/spritesheet.webp` },
      pageUrl: `${source.siteUrl}/pets/${slug}`,
      sourceUrl: `${source.repositoryUrl}/tree/main/pets/${slug}`,
    };
  });
}

// ---- codex-pet.com (BeiXiao/awesome-codex-pets) ----------------------------

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:amp|lt|gt|quot|#39|#x27);/g,
    (entity) => HTML_ENTITIES[entity] ?? entity,
  );
}

/**
 * The repository keeps a thumbnail per pet and lists them all in the README
 * as `<a href="https://codex-pet.com/pets/<slug>"><img src="pets/<slug>/thumb.webp" … alt="<name>">`.
 * The sprites themselves only exist as zips on the site.
 */
export function parseCodexPetComReadme(markdown: string): GalleryPet[] {
  const source = petGallery("codex-pet-com");
  const raw = rawBase(source.repository);
  const pattern =
    /<a href="https:\/\/codex-pet\.com\/pets\/([^"]+)"><img src="pets\/([^"]+)\/thumb\.webp"[^>]*?alt="([^"]*)"/g;
  const seen = new Set<string>();
  const pets: GalleryPet[] = [];
  for (const match of markdown.matchAll(pattern)) {
    const slug = decodeEntities(match[1]!);
    if (seen.has(slug)) continue;
    seen.add(slug);
    const folder = encodeURIComponent(decodeEntities(match[2]!));
    const name = decodeEntities(match[3]!) || slug;
    pets.push({
      gallery: source.id,
      slug,
      name,
      names: [name],
      author: null,
      category: null,
      description: null,
      spriteVersion: null,
      preview: { kind: "image", url: `${raw}/pets/${folder}/thumb.webp`, animationUrl: null },
      spritesheetUrl: null,
      download: { kind: "zip", url: `${source.siteUrl}/api/download/${encodeURIComponent(slug)}` },
      pageUrl: `${source.siteUrl}/pets/${encodeURIComponent(slug)}`,
      sourceUrl: `${source.repositoryUrl}/tree/main/pets/${folder}`,
    });
  }
  return pets;
}

// ---- codexpets.org (eyichan/awesome-codex-pets) ----------------------------

const CodexpetsOrgPet = Schema.Struct({
  id: Schema.String,
  displayName: Schema.String,
  description: Schema.optionalKey(Schema.String),
  author: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.String),
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
  pageUrl: Schema.optionalKey(Schema.String),
  spritesheetUrl: Schema.String,
});
const decodeCodexpetsOrg = Schema.decodeUnknownSync(Schema.Array(CodexpetsOrgPet));

export function parseCodexpetsOrgCatalog(input: unknown): GalleryPet[] {
  const source = petGallery("codexpets-org");
  return decodeCodexpetsOrg(input).map((pet) => {
    const slug = encodeURIComponent(pet.id);
    return {
      gallery: source.id,
      slug: pet.id,
      name: pet.displayName,
      names: [pet.displayName, ...(pet.tags ?? [])],
      author: pet.author ?? null,
      category: pet.kind ?? null,
      description: pet.description ?? null,
      spriteVersion: null,
      preview: null,
      spritesheetUrl: pet.spritesheetUrl,
      download: { kind: "spritesheet", url: pet.spritesheetUrl },
      pageUrl: pet.pageUrl ?? `${source.siteUrl}/pets/${slug}`,
      sourceUrl: `${source.repositoryUrl}/tree/main/pets/${slug}`,
    };
  });
}

// ---- openpets.sh (alterhq/openpets) ----------------------------------------

export const OPENPETS_PAGE_SIZE = 30;

const OpenpetsPet = Schema.Struct({
  id: Schema.String,
  displayName: Schema.String,
  description: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.String),
  ownerName: Schema.optionalKey(Schema.String),
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
  previewUrl: Schema.optionalKey(Schema.String),
  spritesheetUrl: Schema.String,
  validationReport: Schema.optionalKey(
    Schema.Struct({ spriteVersionNumber: Schema.optionalKey(Schema.Number) }),
  ),
});
const OpenpetsPage = Schema.Struct({
  page: Schema.Number,
  total: Schema.Number,
  totalPages: Schema.Number,
  pets: Schema.Array(OpenpetsPet),
});
const decodeOpenpetsPage = Schema.decodeUnknownSync(OpenpetsPage);

export interface GalleryPage {
  readonly pets: ReadonlyArray<GalleryPet>;
  readonly total: number;
  readonly hasMore: boolean;
}

export function parseOpenpetsPage(input: unknown): GalleryPage {
  const source = petGallery("openpets-sh");
  const page = decodeOpenpetsPage(input);
  const absolute = (path: string) => new URL(path, source.siteUrl).toString();
  return {
    total: page.total,
    hasMore: page.page < page.totalPages,
    pets: page.pets.map((pet) => {
      const version = pet.validationReport?.spriteVersionNumber;
      const spritesheetUrl = absolute(pet.spritesheetUrl);
      return {
        gallery: source.id,
        slug: pet.id,
        name: pet.displayName,
        names: [pet.displayName, ...(pet.tags ?? [])],
        author: pet.ownerName ?? null,
        category: pet.kind ?? null,
        description: pet.description ?? null,
        spriteVersion: version === 2 ? 2 : version === 1 ? 1 : null,
        // The site's preview is a strip of every frame at 96×104, not a still.
        preview: pet.previewUrl ? { kind: "strip", url: absolute(pet.previewUrl) } : null,
        spritesheetUrl,
        download: { kind: "spritesheet", url: spritesheetUrl },
        pageUrl: `${source.siteUrl}/pets/${encodeURIComponent(pet.id)}`,
        sourceUrl: `${source.siteUrl}/pets/${encodeURIComponent(pet.id)}`,
      };
    }),
  };
}

export function openpetsPageUrl(
  search: { readonly query: string; readonly category: string | null },
  page: number,
): string {
  const url = new URL("/api/pets", petGallery("openpets-sh").siteUrl);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(OPENPETS_PAGE_SIZE));
  const query = search.query.trim();
  if (query.length > 0) url.searchParams.set("q", query);
  if (search.category !== null) url.searchParams.set("kind", search.category);
  return url.toString();
}

// ---- Loading ---------------------------------------------------------------

async function fetchOk(url: string, fetchFn: GalleryFetch): Promise<Response> {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return response;
}

/** The whole list of a "catalog" gallery, fresh from GitHub. */
export async function loadGalleryCatalog(
  id: PetGalleryId,
  fetchFn: GalleryFetch = galleryFetch,
): Promise<GalleryPet[]> {
  const source = petGallery(id);
  const raw = rawBase(source.repository);
  switch (id) {
    case "codexpet-top":
      return parseCodexpetTopCatalog(await (await fetchOk(`${raw}/pets.json`, fetchFn)).json());
    case "codex-pet-com":
      return parseCodexPetComReadme(await (await fetchOk(`${raw}/README.md`, fetchFn)).text());
    case "codexpets-org":
      return parseCodexpetsOrgCatalog(await (await fetchOk(`${raw}/pets.json`, fetchFn)).json());
    case "openpets-sh":
      throw new Error("openpets.sh is searched through its API, not as a catalog");
  }
}

/** One page of an "api" gallery, searched and filtered by the site. */
export async function loadGalleryPage(
  id: PetGalleryId,
  search: { readonly query: string; readonly category: string | null },
  page: number,
  fetchFn: GalleryFetch = galleryFetch,
): Promise<GalleryPage> {
  if (id !== "openpets-sh") throw new Error(`${id} is a catalog gallery`);
  return parseOpenpetsPage(await (await fetchOk(openpetsPageUrl(search, page), fetchFn)).json());
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** Category order as the gallery lists them, first seen first. */
export function galleryCategories(pets: ReadonlyArray<GalleryPet>): string[] {
  return [...new Set(pets.flatMap((pet) => (pet.category === null ? [] : [pet.category])))];
}

/**
 * Case-insensitive match on any name, author, slug, category or description;
 * every whitespace-separated word of the query has to match somewhere.
 */
export function filterGalleryPets(
  pets: ReadonlyArray<GalleryPet>,
  query: string,
  category: string | null,
): GalleryPet[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return pets.filter((pet) => {
    if (category !== null && pet.category !== category) return false;
    if (words.length === 0) return true;
    const haystack = normalize(
      [...pet.names, pet.author ?? "", pet.slug, pet.category ?? "", pet.description ?? ""].join(
        "\n",
      ),
    );
    return words.every((word) => haystack.includes(word));
  });
}

// ---- Download --------------------------------------------------------------

export class GalleryDownloadError extends Error {
  override readonly name = "GalleryDownloadError";
}

async function spritesheetFromZip(bytes: ArrayBuffer): Promise<Blob> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = Object.values(zip.files).find(
    (file) => !file.dir && /(^|\/)spritesheet\.webp$/i.test(file.name),
  );
  if (!entry) throw new GalleryDownloadError("The download has no spritesheet.webp");
  return entry.async("blob");
}

/**
 * Downloads a pet's spritesheet (unpacking it when the gallery ships zips)
 * and checks it really is one: the decoded image has to be a v1 or v2 sheet.
 * The gallery's own version claim only fills in when the image cannot be
 * decoded here.
 */
export async function downloadGalleryPet(
  pet: Pick<GalleryPet, "download" | "spriteVersion">,
  fetchFn: GalleryFetch = galleryFetch,
  decodeSize: (blob: Blob) => Promise<{ width: number; height: number } | null> = imageSize,
): Promise<{ blob: Blob; spriteVersion: SpriteVersion }> {
  const response = await fetchFn(pet.download.url);
  if (!response.ok) {
    throw new GalleryDownloadError(`Download failed with ${response.status}`);
  }
  const blob =
    pet.download.kind === "zip"
      ? await spritesheetFromZip(await response.arrayBuffer())
      : await response.blob();
  if (blob.size === 0) throw new GalleryDownloadError("The download was empty");
  const size = await decodeSize(blob);
  if (size === null) return { blob, spriteVersion: pet.spriteVersion ?? 1 };
  const spriteVersion = spriteVersionForSize(size.width, size.height);
  if (spriteVersion === null) {
    throw new GalleryDownloadError(
      `The spritesheet is ${size.width}×${size.height}, not a Codex pet sheet`,
    );
  }
  return { blob, spriteVersion };
}

async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    throw new GalleryDownloadError("The spritesheet could not be decoded as an image");
  }
}
