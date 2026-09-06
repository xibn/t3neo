/**
 * The Codex pet spritesheet layout: eight columns of 192×208 cells, one row
 * per animation. v1 sheets have nine rows (1536×1872), v2 sheets add two
 * look-around rows (1536×2288) that the pet does not use. Frame timings
 * follow the Codex app's own playback tables.
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

export const SPRITE_CLIPS: Record<SpriteState, SpriteClip> = {
  idle: { row: 0, durationsMs: [280, 110, 110, 140, 140, 320] },
  "running-right": { row: 1, durationsMs: [120, 120, 120, 120, 120, 120, 120, 220] },
  "running-left": { row: 2, durationsMs: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, durationsMs: [140, 140, 140, 280] },
  jumping: { row: 4, durationsMs: [140, 140, 140, 140, 280] },
  failed: { row: 5, durationsMs: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, durationsMs: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, durationsMs: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, durationsMs: [150, 150, 150, 150, 150, 280] },
};

/** While agents work the pet cycles through these, one at a time, in shuffle-bag order. */
export const SPRITE_WORKING_STATES: ReadonlyArray<SpriteState> = [
  "running",
  "review",
  "jumping",
  "running-right",
  "running-left",
];

/** Working is resolved by the caller, which owns the rotation between working clips. */
export function spriteStateForMood(mood: Exclude<PetMood, "working">): SpriteState {
  switch (mood) {
    case "idle":
      return "idle";
    case "typing":
      return "waiting";
    case "done":
      return "waving";
  }
}
