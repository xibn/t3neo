import { GithubIcon, InfoIcon, PawPrintIcon, StoreIcon } from "lucide-react";
import { useCallback, useState, type CSSProperties } from "react";

import { isElectron } from "~/env";
import {
  ASCII_PET_COLOR_LABELS,
  ASCII_PET_COLORS,
  type AsciiPetColor,
  DEFAULT_NEO_SETTINGS,
  MAX_PET_SIZE,
  MIN_PET_SIZE,
  useNeoSettings,
  useNeoSettingsStore,
  useUpdateNeoSettings,
} from "~/neo/neoSettings";
import { openExternalUrl } from "~/neo/openExternal";
import { ImportedPetCard } from "~/neo/pets/ImportedPetCard";
import {
  DEFAULT_PET_GALLERY,
  petGallery,
  type GalleryPet,
  type PetGalleryId,
} from "~/neo/pets/petGalleries";
import { PetGalleryBrowser } from "~/neo/pets/PetGalleryBrowser";
import {
  removeImportedPet,
  useImportedPets,
  useImportedPetsStore,
  type ImportedPet,
  type ImportedPetId,
} from "~/neo/pets/importedPets";
import { PET_DEFINITIONS } from "~/neo/pets/petRegistry";
import { PetPreview } from "~/neo/pets/PetPreview";
import { NeoFeatureBadge } from "~/neo/NeoBadge";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

function isAsciiPetColor(value: unknown): value is AsciiPetColor {
  return typeof value === "string" && (ASCII_PET_COLORS as ReadonlyArray<string>).includes(value);
}

export function PetSettingsPanel() {
  const settings = useNeoSettings();
  const updateSettings = useUpdateNeoSettings();
  const importedPets = useImportedPets();
  const renameImportedPet = useImportedPetsStore((state) => state.rename);
  const [galleryId, setGalleryId] = useState<PetGalleryId>(DEFAULT_PET_GALLERY);
  const gallery = petGallery(galleryId);
  /** A fresh import is meant to be used, so it becomes the pet right away. */
  const onImported = useCallback((pet: ImportedPet) => {
    useNeoSettingsStore.getState().update({ pet: pet.id });
  }, []);
  const onImportFailed = useCallback((pet: GalleryPet, error: unknown) => {
    toastManager.add({
      type: "error",
      title: `Could not import ${pet.name}`,
      description: error instanceof Error ? error.message : "The download failed.",
    });
  }, []);
  const deleteImportedPet = useCallback((id: ImportedPetId) => {
    if (useNeoSettingsStore.getState().settings.pet === id) {
      useNeoSettingsStore.getState().update({ pet: "none" });
    }
    void removeImportedPet(id);
  }, []);
  const petSizeRatio = (settings.petSize - MIN_PET_SIZE) / (MAX_PET_SIZE - MIN_PET_SIZE);
  const petSizeSliderStyle = {
    "--settings-slider-progress": `${petSizeRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - petSizeRatio}rem`,
  } as CSSProperties;
  return (
    <SettingsPageContainer>
      <SettingsSection
        id="pets"
        title="Pets"
        icon={<PawPrintIcon className="size-4 text-primary" />}
        badge={<NeoFeatureBadge />}
      >
        {/* Same inset as the section title and the rows, so the outer card edges end at the text. */}
        <div
          className="grid gap-3 px-3 sm:grid-cols-2 sm:px-4 lg:grid-cols-4"
          id={searchableSetting("neo-pet").id}
        >
          {PET_DEFINITIONS.map((pet) => (
            <PetPreview
              key={pet.id}
              pet={pet.id}
              label={pet.label}
              description={pet.description}
              selected={settings.pet === pet.id}
              onSelect={(id) => updateSettings({ pet: id })}
            />
          ))}
          {importedPets.map((pet) => (
            <ImportedPetCard
              key={pet.id}
              pet={pet}
              selected={settings.pet === pet.id}
              onSelect={(id) => updateSettings({ pet: id })}
              onRename={renameImportedPet}
              onDelete={deleteImportedPet}
            />
          ))}
        </div>
        {isElectron ? null : (
          <p className="px-3 text-xs text-muted-foreground sm:px-4">
            Pets live in their own window and need the desktop app.
          </p>
        )}

        <SettingsRow
          {...searchableSetting("neo-pet-size")}
          description="Size of the pet. Drag it to move its window."
          resetAction={
            settings.petSize !== DEFAULT_NEO_SETTINGS.petSize ? (
              <SettingResetButton
                label="pet size"
                onClick={() => updateSettings({ petSize: DEFAULT_NEO_SETTINGS.petSize })}
              />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="neo-pet-size"
              >
                {settings.petSize}px
              </output>
              <input
                aria-label="Pet size"
                className="settings-slider min-w-0 flex-1"
                id="neo-pet-size"
                max={MAX_PET_SIZE}
                min={MIN_PET_SIZE}
                onChange={(event) => updateSettings({ petSize: Number(event.currentTarget.value) })}
                step={4}
                style={petSizeSliderStyle}
                type="range"
                value={settings.petSize}
              />
            </div>
          }
        />

        <SettingsRow
          {...searchableSetting("neo-ascii-pet-color")}
          description="Color of the ASCII pets. System follows the appearance."
          resetAction={
            settings.asciiPetColor !== DEFAULT_NEO_SETTINGS.asciiPetColor ? (
              <SettingResetButton
                label="ASCII pet color"
                onClick={() =>
                  updateSettings({ asciiPetColor: DEFAULT_NEO_SETTINGS.asciiPetColor })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-auto">
              <Select
                value={settings.asciiPetColor}
                onValueChange={(value) => {
                  if (isAsciiPetColor(value)) updateSettings({ asciiPetColor: value });
                }}
              >
                <SelectTrigger className="w-full sm:w-36" aria-label="ASCII pet color">
                  <SelectValue>{ASCII_PET_COLOR_LABELS[settings.asciiPetColor]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {ASCII_PET_COLORS.map((color) => (
                    <SelectItem hideIndicator key={color} value={color}>
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="neo-ascii-swatch" data-choice={color} />
                        {ASCII_PET_COLOR_LABELS[color]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <span aria-hidden className="neo-ascii-swatch" data-choice={settings.asciiPetColor} />
            </div>
          }
        />
      </SettingsSection>

      <SettingsSection
        id="codex-pets"
        title="Codex pets"
        icon={<StoreIcon className="size-4 text-primary" />}
        badge={<NeoFeatureBadge />}
        headerAction={
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    className="neo-source-badge inline-flex h-6 items-center gap-1 rounded-full border border-border/70 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    href={gallery.siteUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                    onClick={(event) => {
                      event.preventDefault();
                      openExternalUrl(gallery.siteUrl);
                    }}
                  >
                    <InfoIcon className="size-3" />
                    {gallery.host}
                  </a>
                }
              />
              <TooltipPopup side="top">Pets from the {gallery.host} gallery</TooltipPopup>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={`Open ${gallery.repository} on GitHub`}
                    onClick={() => openExternalUrl(gallery.repositoryUrl)}
                  >
                    <GithubIcon />
                  </Button>
                }
              />
              <TooltipPopup side="top">{gallery.repository} on GitHub</TooltipPopup>
            </Tooltip>
          </div>
        }
      >
        <p
          className="px-3 text-xs text-muted-foreground sm:px-4"
          id={searchableSetting("neo-codex-pets").id}
        >
          Pets made by the community for Codex, from four galleries. Import one to use it here.
          Imports are copies: rename or delete them above, import the same pet again, and later
          changes in the gallery stay out of yours.
        </p>
        <PetGalleryBrowser
          gallery={galleryId}
          onGalleryChange={setGalleryId}
          onImported={onImported}
          onImportFailed={onImportFailed}
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
