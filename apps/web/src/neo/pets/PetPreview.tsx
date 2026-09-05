import { memo, useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import type { PetId } from "../neoSettings";
import { WUKONG_CLIPS, type PetMood, type WukongClip } from "./petRegistry";
import { PetSprite } from "./PetSprite";
import { createClipShuffle, WukongPet } from "./WukongPet";

/** The preview tours every mood so the card shows what the pet can do. */
const PREVIEW_MOODS: ReadonlyArray<PetMood> = ["idle", "typing", "working"];
/** Long enough to see what a clip is before the next one starts. */
const PREVIEW_STEP_MS = 4_000;

function usePreviewMood(): PetMood {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((value) => value + 1), PREVIEW_STEP_MS);
    return () => clearInterval(timer);
  }, []);
  return PREVIEW_MOODS[index % PREVIEW_MOODS.length]!;
}

/**
 * Wukong's preview tours all of his clips in shuffle-bag order: each one plays
 * once before any comes back, so he never dozes off twice in a row.
 */
function useWukongPreviewClip(): WukongClip {
  const shuffle = useRef<(() => WukongClip) | null>(null);
  if (shuffle.current === null) shuffle.current = createClipShuffle(WUKONG_CLIPS);
  const [clip, setClip] = useState<WukongClip>(() => shuffle.current!());
  useEffect(() => {
    const timer = setInterval(() => setClip(shuffle.current!()), PREVIEW_STEP_MS);
    return () => clearInterval(timer);
  }, []);
  return clip;
}

const WukongPreview = memo(function WukongPreview() {
  const clip = useWukongPreviewClip();
  return <WukongPet mood="working" clip={clip} width={120} />;
});

/** A pet card for Settings: the live animation with its label. */
export const PetPreview = memo(function PetPreview({
  pet,
  label,
  description,
  selected,
  onSelect,
}: {
  pet: PetId;
  label: string;
  description: string;
  selected: boolean;
  onSelect: (pet: PetId) => void;
}) {
  const mood = usePreviewMood();
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "neo-pet-preview flex min-w-0 flex-col items-stretch gap-2 rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-primary/60 bg-primary/8"
          : "border-border hover:border-primary/40 hover:bg-accent/40",
      )}
      onClick={() => onSelect(pet)}
    >
      <div className="flex h-32 items-end justify-center overflow-hidden">
        {pet === "wukong" ? (
          <WukongPreview />
        ) : (
          // The X renders at half its size; ask for more so it fills the card like the pets do.
          <PetSprite
            pet={pet}
            mood={mood}
            size={pet === "rabbit" ? 96 : pet === "none" ? 220 : 120}
          />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </button>
  );
});
