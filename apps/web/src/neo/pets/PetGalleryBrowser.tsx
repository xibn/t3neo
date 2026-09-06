import { DownloadIcon, ExternalLinkIcon, LoaderCircleIcon, SearchIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { openExternalUrl } from "../openExternal";
import { galleryFetchAvailable } from "./galleryFetch";
import { importGalleryPet, type ImportedPet } from "./importedPets";
import {
  filterGalleryPets,
  galleryCategories,
  loadGalleryCatalog,
  loadGalleryPage,
  PET_GALLERIES,
  petGallery,
  type GalleryPet,
  type PetGalleryId,
} from "./petGalleries";
import { SpritePet, spriteFrameHeight } from "./SpritePet";
import { SPRITE_COLUMNS } from "./spriteSheet";

/** Cards render in pages so a big gallery never puts hundreds of images on screen at once. */
const PAGE_SIZE = 40;
const THUMBNAIL_WIDTH = 96;
/** Select value for "no category filter"; no gallery category is named this. */
const ALL_CATEGORIES = "__all__";
/** Sites that search for us get the query once typing pauses. */
const SEARCH_DEBOUNCE_MS = 300;

type ResultStatus = "loading" | "error" | "desktop-only" | "ready";

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Results for one gallery. "catalog" galleries are fetched whole and searched
 * here, page by page of PAGE_SIZE; "api" galleries are searched and paged by
 * the site. Late responses of an earlier request are dropped.
 */
function useGalleryResults(galleryId: PetGalleryId, query: string, category: string | null) {
  const source = petGallery(galleryId);
  const [status, setStatus] = useState<ResultStatus>("loading");
  const [catalog, setCatalog] = useState<ReadonlyArray<GalleryPet>>([]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [remote, setRemote] = useState<{
    pets: ReadonlyArray<GalleryPet>;
    total: number;
    hasMore: boolean;
    page: number;
  }>({ pets: [], total: 0, hasMore: false, page: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const debouncedQuery = useDebounced(query, SEARCH_DEBOUNCE_MS);
  const effectiveQuery = source.mode === "api" ? debouncedQuery : query;
  const requestRef = useRef(0);

  useEffect(() => {
    if (source.mode !== "catalog") return;
    if (source.needsDesktop && !galleryFetchAvailable()) {
      setStatus("desktop-only");
      return;
    }
    const request = ++requestRef.current;
    setStatus("loading");
    setCatalog([]);
    loadGalleryCatalog(source.id).then(
      (pets) => {
        if (requestRef.current !== request) return;
        setCatalog(pets);
        setStatus("ready");
      },
      () => {
        if (requestRef.current === request) setStatus("error");
      },
    );
  }, [source, reloadToken]);

  useEffect(() => {
    if (source.mode !== "api") return;
    if (source.needsDesktop && !galleryFetchAvailable()) {
      setStatus("desktop-only");
      return;
    }
    const request = ++requestRef.current;
    setStatus("loading");
    loadGalleryPage(source.id, { query: effectiveQuery, category }, 1).then(
      (page) => {
        if (requestRef.current !== request) return;
        setRemote({ pets: page.pets, total: page.total, hasMore: page.hasMore, page: 1 });
        setStatus("ready");
      },
      () => {
        if (requestRef.current === request) setStatus("error");
      },
    );
  }, [source, effectiveQuery, category, reloadToken]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [source.id, query, category]);

  const filtered = useMemo(
    () => (source.mode === "catalog" ? filterGalleryPets(catalog, query, category) : []),
    [source.mode, catalog, query, category],
  );

  const loadMore = useCallback(() => {
    if (source.mode === "catalog") {
      setVisible((count) => count + PAGE_SIZE);
      return;
    }
    if (loadingMore || !remote.hasMore) return;
    const request = requestRef.current;
    const nextPage = remote.page + 1;
    setLoadingMore(true);
    loadGalleryPage(source.id, { query: effectiveQuery, category }, nextPage)
      .then((page) => {
        if (requestRef.current !== request) return;
        setRemote((current) => ({
          pets: [...current.pets, ...page.pets],
          total: page.total,
          hasMore: page.hasMore,
          page: nextPage,
        }));
      })
      .catch(() => {
        // The page stays as it was; "Show more" can be tried again.
      })
      .finally(() => setLoadingMore(false));
  }, [source, loadingMore, remote, effectiveQuery, category]);

  const retry = useCallback(() => setReloadToken((value) => value + 1), []);

  if (source.mode === "catalog") {
    return {
      status,
      pets: filtered.slice(0, visible),
      total: filtered.length,
      hasMore: visible < filtered.length,
      categories: galleryCategories(catalog),
      loadMore,
      loadingMore: false,
      retry,
    };
  }
  return {
    status,
    pets: remote.pets,
    total: remote.total,
    hasMore: remote.hasMore,
    categories: source.categories,
    loadMore,
    loadingMore,
    retry,
  };
}

/** The first idle frame cut from the sheet: a lazily loaded image behind a frame-sized window. */
const SheetThumbnail = memo(function SheetThumbnail({
  spritesheetUrl,
}: {
  spritesheetUrl: string;
}) {
  return (
    <span
      className="neo-sheet-thumbnail"
      style={{ width: `${THUMBNAIL_WIDTH}px`, height: `${spriteFrameHeight(THUMBNAIL_WIDTH)}px` }}
    >
      <img
        alt=""
        decoding="async"
        loading="lazy"
        src={spritesheetUrl}
        style={{ width: `${THUMBNAIL_WIDTH * SPRITE_COLUMNS}px` }}
      />
    </span>
  );
});

/** One cell of a frame strip: the strip at cell height behind a cell-sized window. */
const StripThumbnail = memo(function StripThumbnail({ url }: { url: string }) {
  const height = spriteFrameHeight(THUMBNAIL_WIDTH);
  return (
    <span
      className="neo-sheet-thumbnail"
      style={{ width: `${THUMBNAIL_WIDTH}px`, height: `${height}px` }}
    >
      <img alt="" decoding="async" loading="lazy" src={url} style={{ height: `${height}px` }} />
    </span>
  );
});

/**
 * The card image: the gallery's still when it has one, the first cell of its
 * frame strip, else the first frame of the sheet. Hovering plays the gallery's
 * animation when it has one, else the idle row of the sheet. A broken still
 * falls back to the sheet.
 */
const GalleryPetThumbnail = memo(function GalleryPetThumbnail({ pet }: { pet: GalleryPet }) {
  const [hovered, setHovered] = useState(false);
  const [failed, setFailed] = useState(false);
  const preview = failed ? null : pet.preview;
  const animationUrl = preview?.kind === "image" ? preview.animationUrl : null;
  const handlers = {
    onPointerEnter: () => setHovered(true),
    onPointerLeave: () => setHovered(false),
  };
  if (hovered && pet.spritesheetUrl && animationUrl === null) {
    return (
      <div {...handlers}>
        <SpritePet
          spritesheetUrl={pet.spritesheetUrl}
          {...(pet.spriteVersion !== null ? { spriteVersion: pet.spriteVersion } : {})}
          mood="idle"
          width={THUMBNAIL_WIDTH}
        />
      </div>
    );
  }
  if (preview?.kind === "image") {
    return (
      <img
        alt=""
        className="neo-codex-pet-thumbnail"
        decoding="async"
        height={spriteFrameHeight(THUMBNAIL_WIDTH)}
        loading="lazy"
        onError={() => setFailed(true)}
        src={hovered && animationUrl ? animationUrl : preview.url}
        width={THUMBNAIL_WIDTH}
        {...handlers}
      />
    );
  }
  if (preview?.kind === "strip") {
    return (
      <div {...handlers}>
        <StripThumbnail url={preview.url} />
      </div>
    );
  }
  if (pet.spritesheetUrl) {
    return (
      <div {...handlers}>
        <SheetThumbnail spritesheetUrl={pet.spritesheetUrl} />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className="flex items-center justify-center rounded-lg bg-muted text-2xl font-semibold text-muted-foreground"
      style={{ width: `${THUMBNAIL_WIDTH}px`, height: `${spriteFrameHeight(THUMBNAIL_WIDTH)}px` }}
    >
      {pet.name.slice(0, 1).toUpperCase()}
    </div>
  );
});

const GalleryPetCard = memo(function GalleryPetCard({
  pet,
  importing,
  onImport,
}: {
  pet: GalleryPet;
  importing: boolean;
  onImport: (pet: GalleryPet) => void;
}) {
  const subline = [pet.author, pet.category].filter(Boolean).join(" · ") || pet.description || "";
  return (
    <div className="neo-codex-pet-card flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3">
      <div className="flex h-28 items-end justify-center overflow-hidden">
        <GalleryPetThumbnail pet={pet} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{pet.name}</div>
        <div className="truncate text-xs text-muted-foreground">{subline || " "}</div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="xs"
          variant="outline"
          disabled={importing}
          aria-label={`Import ${pet.name}`}
          onClick={() => onImport(pet)}
        >
          {importing ? <LoaderCircleIcon className="animate-spin" /> : <DownloadIcon />}
          {importing ? "Importing" : "Import"}
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost-muted"
                className="ml-auto"
                aria-label={`Open ${pet.name} at its source`}
                onClick={() => openExternalUrl(pet.sourceUrl)}
              >
                <ExternalLinkIcon />
              </Button>
            }
          />
          <TooltipPopup side="top">Files and license</TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
});

/**
 * Browse and search one of the Codex pet galleries and import pets from it.
 * Lists are fetched fresh each time the panel opens, so new pets show up on
 * their own. Importing copies the pet; nothing links back afterwards.
 */
export function PetGalleryBrowser({
  gallery,
  onGalleryChange,
  onImported,
  onImportFailed,
}: {
  gallery: PetGalleryId;
  onGalleryChange: (gallery: PetGalleryId) => void;
  onImported: (pet: ImportedPet) => void;
  onImportFailed: (pet: GalleryPet, error: unknown) => void;
}) {
  const source = petGallery(gallery);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [importing, setImporting] = useState<ReadonlySet<string>>(() => new Set());
  const results = useGalleryResults(gallery, query, category);

  // Categories differ per gallery, so a filter never carries over.
  useEffect(() => {
    setCategory(null);
  }, [gallery]);

  const importPet = useCallback(
    (pet: GalleryPet) => {
      const key = `${pet.gallery}:${pet.slug}`;
      setImporting((current) => new Set(current).add(key));
      importGalleryPet(pet)
        .then(onImported, (error: unknown) => onImportFailed(pet, error))
        .finally(() => {
          setImporting((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        });
    },
    [onImported, onImportFailed],
  );

  return (
    <div className="space-y-3 px-3 sm:px-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={gallery}
          onValueChange={(value) => {
            const next = PET_GALLERIES.find((entry) => entry.id === value);
            if (next) onGalleryChange(next.id);
          }}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Gallery">
            <SelectValue>{source.host}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="start" alignItemWithTrigger={false}>
            {PET_GALLERIES.map((entry) => (
              <SelectItem hideIndicator key={entry.id} value={entry.id}>
                {entry.host}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            nativeInput
            type="search"
            size="compact"
            className="[&_input]:pl-8"
            aria-label="Search pets"
            placeholder="Search pets"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        {results.categories.length > 0 ? (
          <Select
            value={category ?? ALL_CATEGORIES}
            onValueChange={(value) => {
              setCategory(typeof value === "string" && value !== ALL_CATEGORIES ? value : null);
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Category">
              <SelectValue>{category ?? "All categories"}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value={ALL_CATEGORIES}>
                All categories
              </SelectItem>
              {results.categories.map((entry) => (
                <SelectItem hideIndicator key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        ) : null}
      </div>

      {results.status === "loading" ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin" />
          Loading pets
        </p>
      ) : results.status === "desktop-only" ? (
        <p className="py-6 text-sm text-muted-foreground">
          {source.host} can only be browsed from the desktop app.
        </p>
      ) : results.status === "error" ? (
        <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <span>Could not load the pet list.</span>
          <Button size="xs" variant="outline" onClick={results.retry}>
            Try again
          </Button>
        </div>
      ) : results.pets.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">No pets match.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {results.pets.map((pet) => (
              <GalleryPetCard
                key={`${pet.gallery}:${pet.slug}`}
                pet={pet}
                importing={importing.has(`${pet.gallery}:${pet.slug}`)}
                onImport={importPet}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {results.pets.length} of {results.total} pets
            </span>
            {results.hasMore ? (
              <Button
                size="xs"
                variant="outline"
                disabled={results.loadingMore}
                onClick={results.loadMore}
              >
                {results.loadingMore ? <LoaderCircleIcon className="animate-spin" /> : null}
                Show more
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
