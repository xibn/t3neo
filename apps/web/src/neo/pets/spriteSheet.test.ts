import { describe, expect, it } from "vite-plus/test";

import {
  advanceSpritePlayback,
  endSpriteGesture,
  SPRITE_CELL_HEIGHT,
  SPRITE_CLIPS,
  SPRITE_COLUMNS,
  SPRITE_STATE_CYCLES,
  spriteFrameDurationMs,
  spriteRows,
  spriteStateForMood,
  spriteVersionForSize,
  startSpriteGesture,
  startSpriteState,
  type SpritePlayback,
} from "./spriteSheet";

describe("spriteVersionForSize", () => {
  it("recognises v1 and v2 sheets by their exact size", () => {
    expect(spriteVersionForSize(1536, 1872)).toBe(1);
    expect(spriteVersionForSize(1536, 2288)).toBe(2);
  });

  it("rejects anything that is not a pet sheet", () => {
    expect(spriteVersionForSize(1536, 1000)).toBeNull();
    expect(spriteVersionForSize(768, 1872)).toBeNull();
    expect(spriteVersionForSize(0, 0)).toBeNull();
  });

  it("matches the row counts the sizes imply", () => {
    expect(spriteRows(1) * SPRITE_CELL_HEIGHT).toBe(1872);
    expect(spriteRows(2) * SPRITE_CELL_HEIGHT).toBe(2288);
  });
});

describe("SPRITE_CLIPS", () => {
  it("stays inside a v1 sheet and the eight columns", () => {
    for (const clip of Object.values(SPRITE_CLIPS)) {
      expect(clip.row).toBeLessThan(spriteRows(1));
      expect(clip.durationsMs.length).toBeGreaterThan(0);
      expect(clip.durationsMs.length).toBeLessThanOrEqual(SPRITE_COLUMNS);
    }
  });

  it("maps the pet's moods to Codex states and ignores typing", () => {
    expect(spriteStateForMood("idle")).toBe("idle");
    expect(spriteStateForMood("typing")).toBe("idle");
    expect(spriteStateForMood("working")).toBe("running");
    expect(spriteStateForMood("waiting")).toBe("waiting");
    expect(spriteStateForMood("failed")).toBe("failed");
    expect(spriteStateForMood("done")).toBe("review");
  });
});

function play(playback: SpritePlayback, steps: number): SpritePlayback {
  let current = playback;
  for (let index = 0; index < steps; index += 1) current = advanceSpritePlayback(current);
  return current;
}

describe("sprite playback", () => {
  it("plays a state row three times, then settles into the idle loop", () => {
    const frames = SPRITE_CLIPS.running.durationsMs.length;
    let playback = startSpriteState("running");
    expect(playback).toMatchObject({ state: "running", frame: 0, cyclesLeft: SPRITE_STATE_CYCLES });
    playback = play(playback, frames);
    expect(playback).toMatchObject({ state: "running", frame: 0, cyclesLeft: 2 });
    playback = play(playback, frames * 2);
    expect(playback).toMatchObject({ state: "idle", frame: 0, cyclesLeft: null });
    // Idle never ends.
    playback = play(playback, SPRITE_CLIPS.idle.durationsMs.length * 5 + 2);
    expect(playback).toMatchObject({ state: "idle", frame: 2 });
  });

  it("uses each frame's own hold time", () => {
    const playback = startSpriteState("waiting");
    expect(spriteFrameDurationMs(playback)).toBe(150);
    expect(spriteFrameDurationMs(play(playback, 5))).toBe(260);
    expect(spriteFrameDurationMs(startSpriteState("idle"))).toBe(1680);
  });

  it("waves once on top of a state and hands back to it", () => {
    const running = play(startSpriteState("running"), 2);
    const waving = startSpriteGesture(running, "waving");
    expect(waving).toMatchObject({ state: "waving", frame: 0, cyclesLeft: 1 });
    const after = play(waving, SPRITE_CLIPS.waving.durationsMs.length);
    expect(after).toMatchObject({ state: "running", frame: 2, cyclesLeft: SPRITE_STATE_CYCLES });
  });

  it("runs while dragged, keeps the stride when the direction flips, then resumes", () => {
    const idle = play(startSpriteState("idle"), 3);
    const right = play(startSpriteGesture(idle, "running-right"), 5);
    expect(right).toMatchObject({ state: "running-right", frame: 5, cyclesLeft: null });
    const left = startSpriteGesture(right, "running-left");
    expect(left).toMatchObject({ state: "running-left", frame: 5 });
    expect(left.resume).toEqual(idle);
    // A drag never ends on its own, only when the pointer lets go.
    expect(play(left, 40).state).toBe("running-left");
    expect(endSpriteGesture(left)).toEqual(idle);
    expect(endSpriteGesture(idle)).toEqual(idle);
  });
});
