/**
 * The Codex pet spritesheet layout: eight columns of 192×208 cells, one row
 * per animation. v1 sheets have nine rows (1536×1872), v2 sheets add two
 * look-around rows (1536×2288) that the pet does not use. Frame timings and
 * the playback rules follow the Codex terminal app: a state row plays three
 * times, then the pet settles into the slow idle loop until the next change.
 */

import type { PetMood } from "./petRegistry";

export const SPRITE_COLUMNS = 8;
export const SPRITE_SHEET_WIDTH = 1536;
export const SPRITE_CELL_WIDTH = 192;
export const SPRITE_CELL_HEIGHT = 208;

export type SpriteVersion = 1 | 2;

const SPRITE_ROWS: Record<SpriteVersion, number> = { 1: 9, 2: 11 };

export function spriteRows(version: SpriteVersion): number {
  return SPRITE_ROWS[version];
}

/** Which sheet version a decoded image is, by its exact size; anything else is not a pet sheet. */
export function spriteVersionForSize(width: number, height: number): SpriteVersion | null {
  if (width !== SPRITE_SHEET_WIDTH) return null;
  if (height === SPRITE_ROWS[1] * SPRITE_CELL_HEIGHT) return 1;
  if (height === SPRITE_ROWS[2] * SPRITE_CELL_HEIGHT) return 2;
  return null;
}

export type SpriteState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export interface SpriteClip {
  readonly row: number;
  /** Per-frame hold times in milliseconds; the frame count is the length. */
  readonly durationsMs: ReadonlyArray<number>;
}

/** Codex's own timing tables; idle is the slow breathing loop, not the preview GIF's tempo. */
export const SPRITE_CLIPS: Record<SpriteState, SpriteClip> = {
  idle: { row: 0, durationsMs: [1680, 660, 660, 840, 840, 1920] },
  "running-right": { row: 1, durationsMs: [120, 120, 120, 120, 120, 120, 120, 220] },
  "running-left": { row: 2, durationsMs: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, durationsMs: [140, 140, 140, 280] },
  jumping: { row: 4, durationsMs: [140, 140, 140, 140, 280] },
  failed: { row: 5, durationsMs: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, durationsMs: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, durationsMs: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, durationsMs: [150, 150, 150, 150, 150, 280] },
};

/** A state row plays this often before the pet settles into idle (Codex's `app_state_animation`). */
export const SPRITE_STATE_CYCLES = 3;

/**
 * The Codex states the pet's activity maps to. Typing is not one of them:
 * Codex pets do not react to the composer, only to what the agent does.
 */
export function spriteStateForMood(mood: PetMood): SpriteState {
  switch (mood) {
    case "idle":
    case "typing":
      return "idle";
    case "working":
      return "running";
    case "waiting":
      return "waiting";
    case "failed":
      return "failed";
    case "done":
      return "review";
  }
}

/**
 * What the sheet shows right now: the row, the frame in it, and how many
 * passes of the row are still due before idle takes over (null loops).
 * `resume` remembers the sequence a gesture (a wave, a drag) interrupted.
 */
export interface SpritePlayback {
  readonly state: SpriteState;
  readonly frame: number;
  readonly cyclesLeft: number | null;
  readonly resume: SpritePlayback | null;
}

const IDLE_PLAYBACK: SpritePlayback = { state: "idle", frame: 0, cyclesLeft: null, resume: null };

/** Starts a state the way Codex does: three passes of its row, then idle; idle just loops. */
export function startSpriteState(state: SpriteState): SpritePlayback {
  if (state === "idle") return IDLE_PLAYBACK;
  return { state, frame: 0, cyclesLeft: SPRITE_STATE_CYCLES, resume: null };
}

/** A gesture plays on top of whatever was running and hands back to it afterwards. */
export function startSpriteGesture(
  current: SpritePlayback,
  gesture: "waving" | "running-left" | "running-right",
): SpritePlayback {
  const resume = current.resume ?? current;
  // Switching drag direction keeps the stride so the legs do not restart.
  const frame =
    (gesture === "running-left" || gesture === "running-right") &&
    (current.state === "running-left" || current.state === "running-right")
      ? current.frame
      : 0;
  return { state: gesture, frame, cyclesLeft: gesture === "waving" ? 1 : null, resume };
}

/** Ends a looping gesture (a drag) and returns to the interrupted sequence. */
export function endSpriteGesture(current: SpritePlayback): SpritePlayback {
  return current.resume ?? current;
}

/** The next frame; at the end of a row the sequence decides where to go. */
export function advanceSpritePlayback(current: SpritePlayback): SpritePlayback {
  const frameCount = SPRITE_CLIPS[current.state].durationsMs.length;
  const next = current.frame + 1;
  if (next < frameCount) return { ...current, frame: next };
  if (current.cyclesLeft === null) return { ...current, frame: 0 };
  if (current.cyclesLeft > 1) return { ...current, frame: 0, cyclesLeft: current.cyclesLeft - 1 };
  return current.resume ?? IDLE_PLAYBACK;
}

/** How long the current frame stays up. */
export function spriteFrameDurationMs(playback: SpritePlayback): number {
  const durations = SPRITE_CLIPS[playback.state].durationsMs;
  return durations[Math.min(playback.frame, durations.length - 1)] ?? durations[0]!;
}
