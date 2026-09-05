import { PawPrintIcon, PictureInPicture2Icon } from "lucide-react";
import { useCallback, type CSSProperties } from "react";

import { isElectron } from "~/env";
import {
  ASCII_PET_COLOR_LABELS,
  ASCII_PET_COLORS,
  type AsciiPetColor,
  DEFAULT_NEO_SETTINGS,
  MAX_PET_SIZE,
  MAX_PET_WORKING_INTERVAL_SEC,
  MIN_PET_SIZE,
  MIN_PET_WORKING_INTERVAL_SEC,
  useNeoSettings,
  useUpdateNeoSettings,
} from "~/neo/neoSettings";
import { PET_DEFINITIONS } from "~/neo/pets/petRegistry";
import { PetPreview } from "~/neo/pets/PetPreview";
import { NeoFeatureBadge } from "~/neo/NeoBadge";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
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
  const petSizeRatio = (settings.petSize - MIN_PET_SIZE) / (MAX_PET_SIZE - MIN_PET_SIZE);
  const petSizeSliderStyle = {
    "--settings-slider-progress": `${petSizeRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - petSizeRatio}rem`,
  } as CSSProperties;
  const workingIntervalRatio =
    (settings.petWorkingIntervalSec - MIN_PET_WORKING_INTERVAL_SEC) /
    (MAX_PET_WORKING_INTERVAL_SEC - MIN_PET_WORKING_INTERVAL_SEC);
  const workingIntervalSliderStyle = {
    "--settings-slider-progress": `${workingIntervalRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - workingIntervalRatio}rem`,
  } as CSSProperties;
  const openPetWindow = useCallback(() => {
    void window.desktopBridge?.pet?.openWindow();
  }, []);

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
        </div>

        <SettingsRow
          {...searchableSetting("neo-pet-size")}
          description="Size of the pet. Drag it anywhere; it remembers the spot."
          resetAction={
            settings.petSize !== DEFAULT_NEO_SETTINGS.petSize || settings.petPosition !== null ? (
              <SettingResetButton
                label="pet size and position"
                onClick={() =>
                  updateSettings({ petSize: DEFAULT_NEO_SETTINGS.petSize, petPosition: null })
                }
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
          {...searchableSetting("neo-pet-working-interval")}
          description="How long Wukong keeps one exercise before switching to the next while agents work."
          resetAction={
            settings.petWorkingIntervalSec !== DEFAULT_NEO_SETTINGS.petWorkingIntervalSec ? (
              <SettingResetButton
                label="working animation interval"
                onClick={() =>
                  updateSettings({
                    petWorkingIntervalSec: DEFAULT_NEO_SETTINGS.petWorkingIntervalSec,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="neo-pet-working-interval"
              >
                {settings.petWorkingIntervalSec}s
              </output>
              <input
                aria-label="Working animation interval"
                className="settings-slider min-w-0 flex-1"
                id="neo-pet-working-interval"
                max={MAX_PET_WORKING_INTERVAL_SEC}
                min={MIN_PET_WORKING_INTERVAL_SEC}
                onChange={(event) =>
                  updateSettings({ petWorkingIntervalSec: Number(event.currentTarget.value) })
                }
                step={1}
                style={workingIntervalSliderStyle}
                type="range"
                value={settings.petWorkingIntervalSec}
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

        {isElectron && window.desktopBridge?.pet ? (
          <SettingsRow
            {...searchableSetting("neo-pet-window")}
            description="Show the pet in its own always-on-top window that floats over other apps. Clicking it brings T3 Neo forward."
            control={
              <Button
                size="sm"
                variant="outline"
                disabled={settings.pet === "none"}
                onClick={openPetWindow}
              >
                <PictureInPicture2Icon />
                Open pet window
              </Button>
            }
          />
        ) : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
