import { memo, useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import { prefersReducedMotion } from "./AsciiAnimation";
import { useImportedPet, useSpritesheetUrl, type ImportedPetId } from "./importedPets";
import type { PetMood } from "./petRegistry";
import {
  advanceSpritePlayback,
  endSpriteGesture,
  SPRITE_CELL_HEIGHT,
  SPRITE_CELL_WIDTH,
  SPRITE_CLIPS,
  SPRITE_COLUMNS,
  spriteFrameDurationMs,
  spriteRows,
  spriteStateForMood,
  startSpriteGesture,
  startSpriteState,
  type SpritePlayback,
  type SpriteState,
  type SpriteVersion,
} from "./spriteSheet";

/** Height of one frame at `width` pixels, whole pixels so the sheet lines up. */
export function spriteFrameHeight(width: number): number {
  return Math.round((width * SPRITE_CELL_HEIGHT) / SPRITE_CELL_WIDTH);
}

export type SpriteDragDirection = "left" | "right";

/** What the user does to the pet: a drag runs it along, a click makes it wave. */
export interface SpriteGesture {
  readonly dragDirection: SpriteDragDirection | null;
  /** Bumped on every click; each bump plays one wave. */
  readonly waveToken: number;
}

/**
 * Plays a Codex pet spritesheet the way the Codex app does. A change of
 * state plays that state's row three times and then settles into the slow
 * idle loop; the same state arriving again (`stateKey`) restarts it, as a
 * new notification does in Codex. A drag runs the pet left or right for as
 * long as it lasts, a click waves once, and both hand back to the sequence
 * they interrupted. One style change per frame, nothing else repaints;
 * playback pauses while the document is hidden, and reduced motion holds
 * the first frame.
 */
export const SpritePet = memo(function SpritePet({
  spritesheetUrl,
  spriteVersion,
  mood,
  stateKey = "",
  width,
  playing = true,
  state: forcedState,
  gesture,
  className,
}: {
  spritesheetUrl: string;
  /** Unknown (gallery previews) lets the image's own aspect place the rows. */
  spriteVersion?: SpriteVersion;
  mood: PetMood;
  /** Changes when the mood's cause changes (another thread), which replays the state. */
  stateKey?: string;
  width: number;
  playing?: boolean;
  /** Play this row regardless of mood, looping. */
  state?: SpriteState;
  gesture?: SpriteGesture;
  className?: string;
}) {
  const targetState = forcedState ?? spriteStateForMood(mood);
  const [playback, setPlayback] = useState<SpritePlayback>(() =>
    forcedState
      ? { ...startSpriteState(forcedState), cyclesLeft: null }
      : startSpriteState(targetState),
  );

  useEffect(() => {
    setPlayback(
      forcedState
        ? { ...startSpriteState(forcedState), cyclesLeft: null }
        : startSpriteState(targetState),
    );
  }, [targetState, stateKey, forcedState]);

  const dragDirection = gesture?.dragDirection ?? null;
  useEffect(() => {
    if (dragDirection === null) {
      setPlayback((current) =>
        current.state === "running-left" || current.state === "running-right"
          ? endSpriteGesture(current)
          : current,
      );
      return;
    }
    setPlayback((current) =>
      startSpriteGesture(current, dragDirection === "left" ? "running-left" : "running-right"),
    );
  }, [dragDirection]);

  const waveToken = gesture?.waveToken ?? 0;
  useEffect(() => {
    if (waveToken === 0) return;
    setPlayback((current) => startSpriteGesture(current, "waving"));
  }, [waveToken]);

  useEffect(() => {
    if (!playing || prefersReducedMotion()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null || document.hidden) return;
      timer = setTimeout(() => {
        timer = null;
        setPlayback((current) => advanceSpritePlayback(current));
      }, spriteFrameDurationMs(playback));
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
      } else {
        schedule();
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playback, playing]);

  const height = spriteFrameHeight(width);
  const row = SPRITE_CLIPS[playback.state].row;
  return (
    <div
      aria-hidden
      className={cn("neo-sprite-pet", className)}
      data-sprite-state={playback.state}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundImage: `url("${spritesheetUrl}")`,
        backgroundSize: `${width * SPRITE_COLUMNS}px ${
          spriteVersion === undefined ? "auto" : `${height * spriteRows(spriteVersion)}px`
        }`,
        backgroundPosition: `${-playback.frame * width}px ${-row * height}px`,
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
  stateKey,
  width,
  playing,
  state,
  gesture,
}: {
  id: ImportedPetId;
  mood: PetMood;
  stateKey?: string;
  width: number;
  playing?: boolean;
  state?: SpriteState;
  gesture?: SpriteGesture;
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
      {...(stateKey !== undefined ? { stateKey } : {})}
      {...(playing !== undefined ? { playing } : {})}
      {...(state !== undefined ? { state } : {})}
      {...(gesture !== undefined ? { gesture } : {})}
    />
  );
});
