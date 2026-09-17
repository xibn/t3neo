import { describe, expect, it } from "vite-plus/test";

import { WUKONG_CLIPS, type WukongClip } from "./petRegistry";
import { createClipShuffle } from "./WukongPet";

/** A deterministic generator so bag order is stable across runs. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

describe("createClipShuffle", () => {
  it("plays every clip once before any repeats", () => {
    const next = createClipShuffle(WUKONG_CLIPS, seededRandom(3));
    for (let round = 0; round < 5; round += 1) {
      const bag = new Set<WukongClip>();
      for (let index = 0; index < WUKONG_CLIPS.length; index += 1) bag.add(next());
      expect([...bag].sort()).toEqual([...WUKONG_CLIPS].sort());
    }
  });

  it("never plays the same clip twice in a row across bags", () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const next = createClipShuffle(WUKONG_CLIPS, seededRandom(seed));
      let previous = next();
      for (let index = 0; index < WUKONG_CLIPS.length * 6; index += 1) {
        const clip = next();
        expect(clip).not.toBe(previous);
        previous = clip;
      }
    }
  });
});
