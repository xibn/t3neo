import { describe, expect, it } from "vite-plus/test";

import {
  SPRITE_CELL_HEIGHT,
  SPRITE_CLIPS,
  SPRITE_COLUMNS,
  SPRITE_WORKING_STATES,
  spriteRows,
  spriteStateForMood,
  spriteVersionForSize,
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

  it("maps every non-working mood to one clip and keeps the working set distinct", () => {
    expect(spriteStateForMood("idle")).toBe("idle");
    expect(spriteStateForMood("typing")).toBe("waiting");
    expect(spriteStateForMood("done")).toBe("waving");
    expect(new Set(SPRITE_WORKING_STATES).size).toBe(SPRITE_WORKING_STATES.length);
    for (const state of SPRITE_WORKING_STATES) expect(SPRITE_CLIPS[state]).toBeDefined();
  });
});
