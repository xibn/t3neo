import { memo, useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { prefersReducedMotion } from "./AsciiAnimation";
import { useImportedPet, useSpritesheetUrl, type ImportedPetId } from "./importedPets";
import type { PetMood } from "./petRegistry";
import {
  SPRITE_CELL_HEIGHT,
  SPRITE_CELL_WIDTH,
  SPRITE_CLIPS,
  SPRITE_COLUMNS,
  SPRITE_WORKING_STATES,
  spriteRows,
  spriteStateForMood,
  type SpriteState,
  type SpriteVersion,
} from "./spriteSheet";
import { createClipShuffle, WORKING_CLIP_ROTATION_MS } from "./WukongPet";

/** Height of one frame at `width` pixels, whole pixels so the sheet lines up. */
export function spriteFrameHeight(width: number): number {
  return Math.round((width * SPRITE_CELL_HEIGHT) / SPRITE_CELL_WIDTH);
}

/**
 * Plays one row of a Codex pet spritesheet by sliding the background image
 * under a frame-sized box: one style change per frame, no image decoding
 * and nothing else repaints. Frame holds follow the clip's timing table,
 * playback pauses while the document is hidden, and reduced motion holds
 * the first frame. Idle, typing and done map to one clip each; working
 * rotates through the working clips like Wukong does.
 */
export const SpritePet = memo(function SpritePet({
  spritesheetUrl,
  spriteVersion,
  mood,
  width,
  playing = true,
  rotationMs = WORKING_CLIP_ROTATION_MS,
  state: forcedState,
  className,
}: {
  spritesheetUrl: string;
  /** Unknown (gallery previews) lets the image's own aspect place the rows. */
  spriteVersion?: SpriteVersion;
  mood: PetMood;
  width: number;
  playing?: boolean;
  /** How often the working clip changes. */
  rotationMs?: number;
  /** Play this clip regardless of mood. */
  state?: SpriteState;
  className?: string;
}) {
  const shuffle = useRef<(() => SpriteState) | null>(null);
  if (shuffle.current === null) shuffle.current = createClipShuffle(SPRITE_WORKING_STATES);
  const [workingState, setWorkingState] = useState<SpriteState>(() => shuffle.current!());

  useEffect(() => {
    if (mood !== "working" || forcedState) return;
    const timer = setInterval(() => setWorkingState(shuffle.current!()), rotationMs);
    return () => clearInterval(timer);
  }, [mood, rotationMs, forcedState]);

  const state = forcedState ?? (mood === "working" ? workingState : spriteStateForMood(mood));
  const clip = SPRITE_CLIPS[state];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    setFrame(0);
    if (!playing || clip.durationsMs.length <= 1 || prefersReducedMotion()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let index = 0;
    const step = () => {
      index = (index + 1) % clip.durationsMs.length;
      setFrame(index);
      timer = setTimeout(step, clip.durationsMs[index]);
    };
    const start = () => {
      if (timer !== null) return;
      timer = setTimeout(step, clip.durationsMs[index]);
    };
    const stop = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clip, playing]);

  const height = spriteFrameHeight(width);
  return (
    <div
      aria-hidden
      className={cn("neo-sprite-pet", className)}
      data-sprite-state={state}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundImage: `url("${spritesheetUrl}")`,
        backgroundSize: `${width * SPRITE_COLUMNS}px ${
          spriteVersion === undefined ? "auto" : `${height * spriteRows(spriteVersion)}px`
        }`,
        backgroundPosition: `${-frame * width}px ${-clip.row * height}px`,
        backgroundRepeat: "no-repeat",
        // Pixel art stays crisp when blown up; when shrunk, smoothing reads better.
        imageRendering: width > SPRITE_CELL_WIDTH ? "pixelated" : "auto",
      }}
    />
  );
});

/** An imported pet by id: loads its sheet from storage, holds the space until it is there. */
export const ImportedPetSprite = memo(function ImportedPetSprite({
  id,
  mood,
  width,
  playing,
  rotationMs,
  state,
}: {
  id: ImportedPetId;
  mood: PetMood;
  width: number;
  playing?: boolean;
  rotationMs?: number;
  state?: SpriteState;
}) {
  const pet = useImportedPet(id);
  const url = useSpritesheetUrl(id);
  if (!pet || !url) {
    return <div style={{ width: `${width}px`, height: `${spriteFrameHeight(width)}px` }} />;
  }
  return (
    <SpritePet
      spritesheetUrl={url}
      spriteVersion={pet.spriteVersion}
      mood={mood}
      width={width}
      {...(playing !== undefined ? { playing } : {})}
      {...(rotationMs !== undefined ? { rotationMs } : {})}
      {...(state !== undefined ? { state } : {})}
    />
  );
});
