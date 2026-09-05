import type { PetId } from "../neoSettings";

export type PetMood = "idle" | "typing" | "working";

export interface PetDefinition {
  readonly id: PetId;
  readonly label: string;
  readonly description: string;
}

export const PET_DEFINITIONS: ReadonlyArray<PetDefinition> = [
  {
    id: "none",
    label: "No pet",
    description: "Keeps the corner empty.",
  },
  {
    id: "rabbit",
    label: "Hoppy (Loop)",
    description: "A white rabbit that hops in place, whatever the agents are doing.",
  },
  {
    id: "wukong",
    label: "Wukong (Reactive)",
    description:
      "An ASCII monkey. He sleeps while you are away, hangs around while you type, and does shapeshifter shenanigans while your agents work.",
  },
  {
    id: "lunar",
    label: "Lunar (No Animation)",
    description: "No pet, just the status: the badge and the activity list stay.",
  },
];

export function petDefinition(id: PetId): PetDefinition {
  return PET_DEFINITIONS.find((pet) => pet.id === id) ?? PET_DEFINITIONS[0]!;
}

export interface AsciiFrames {
  readonly delayMs: number;
  readonly frames: ReadonlyArray<string>;
  /**
   * The canvas the frames were drawn on. Stored frames drop trailing blanks,
   * so a clip whose art never reaches the right edge would otherwise measure
   * narrower than its siblings and render larger at the same width.
   */
  readonly columns?: number;
  readonly rows?: number;
}

export type WukongClip = "sleeping" | "typing" | "monk" | "somersault" | "working" | "hoop";

export const WUKONG_WORKING_CLIPS: ReadonlyArray<WukongClip> = [
  "monk",
  "somersault",
  "working",
  "hoop",
];

/** Every clip Wukong has, for previews that tour all of them. */
export const WUKONG_CLIPS: ReadonlyArray<WukongClip> = [
  "sleeping",
  "typing",
  ...WUKONG_WORKING_CLIPS,
];

/** Frames are lazy: they weigh a few hundred kilobytes and only pets use them. */
export function loadWukongClip(clip: WukongClip): Promise<AsciiFrames> {
  switch (clip) {
    case "sleeping":
      return import("./frames/wukong-sleeping.json").then((module) => module.default);
    case "typing":
      return import("./frames/wukong-typing.json").then((module) => module.default);
    case "monk":
      return import("./frames/wukong-monk.json").then((module) => module.default);
    case "somersault":
      return import("./frames/wukong-somersault.json").then((module) => module.default);
    case "working":
      return import("./frames/wukong-working.json").then((module) => module.default);
    case "hoop":
      return import("./frames/wukong-hoop.json").then((module) => module.default);
  }
}

export function wukongClipForMood(
  mood: PetMood,
  pickWorkingClip: () => WukongClip = () =>
    WUKONG_WORKING_CLIPS[Math.floor(Math.random() * WUKONG_WORKING_CLIPS.length)]!,
): WukongClip {
  switch (mood) {
    case "idle":
      return "sleeping";
    case "typing":
      return "typing";
    case "working":
      return pickWorkingClip();
  }
}

/**
 * The "nothing here" preview: a wireframe X spinning in 3D, drawn as ASCII.
 * Two diagonal bars rotate about the vertical axis; nearer strokes use
 * heavier glyphs so the turn reads as depth. Frames are generated once.
 */
const X_FRAME_COUNT = 32;
const X_COLUMNS = 25;
const X_ROWS = 11;

function spinningXFrames(): AsciiFrames {
  const frames: string[] = [];
  const half = (X_ROWS - 1) / 2;
  for (let frame = 0; frame < X_FRAME_COUNT; frame += 1) {
    const angle = (frame / X_FRAME_COUNT) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const grid: string[][] = Array.from({ length: X_ROWS }, () => Array(X_COLUMNS).fill(" "));
    const depth: number[][] = Array.from({ length: X_ROWS }, () =>
      Array(X_COLUMNS).fill(Number.NEGATIVE_INFINITY),
    );
    // Sample both bars densely; each sample is a 3D point (x, y, 0) rotated about Y.
    for (let step = 0; step <= 60; step += 1) {
      const t = step / 60 - 0.5;
      for (const sign of [1, -1]) {
        const x3 = t * 2;
        const y3 = t * 2 * sign;
        const rx = x3 * cos;
        const rz = x3 * sin;
        const center = Math.round(X_COLUMNS / 2 - 0.5 + rx * (X_COLUMNS / 2 - 2));
        const row = Math.round(half - y3 * half);
        if (row < 0 || row >= X_ROWS) continue;
        // Each bar is three cells wide so the X reads as a solid, massive block.
        for (const column of [center - 1, center, center + 1]) {
          if (column < 0 || column >= X_COLUMNS) continue;
          if (rz <= depth[row]![column]!) continue;
          depth[row]![column] = rz;
          grid[row]![column] = rz > 0.35 ? "@" : rz > -0.35 ? "#" : "+";
        }
      }
    }
    frames.push(grid.map((row) => row.join("").replace(/\s+$/, "")).join("\n"));
  }
  return { delayMs: 70, frames };
}

export const NOTHING_FRAMES: AsciiFrames = spinningXFrames();
