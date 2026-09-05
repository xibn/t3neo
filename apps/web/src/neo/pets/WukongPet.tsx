import { memo, useEffect, useRef, useState } from "react";

import { AsciiAnimation } from "./AsciiAnimation";
import {
  loadWukongClip,
  WUKONG_WORKING_CLIPS,
  wukongClipForMood,
  type AsciiFrames,
  type PetMood,
  type WukongClip,
} from "./petRegistry";

/** While agents work, Wukong changes exercise every so often; Settings → Pets tunes this. */
export const WORKING_CLIP_ROTATION_MS = 6_000;

const clipCache = new Map<WukongClip, AsciiFrames>();

function useWukongClip(clip: WukongClip): AsciiFrames | null {
  const [frames, setFrames] = useState<AsciiFrames | null>(() => clipCache.get(clip) ?? null);
  useEffect(() => {
    const cached = clipCache.get(clip);
    if (cached) {
      setFrames(cached);
      return;
    }
    let cancelled = false;
    void loadWukongClip(clip).then((loaded) => {
      clipCache.set(clip, loaded);
      if (!cancelled) setFrames(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [clip]);
  return frames;
}

/**
 * Shuffle-bag order over a set of clips: every clip plays once before any
 * repeats, and a new bag never starts with the clip that just ended.
 */
export function createClipShuffle(
  clips: ReadonlyArray<WukongClip> = WUKONG_WORKING_CLIPS,
  random: () => number = Math.random,
): () => WukongClip {
  let bag: WukongClip[] = [];
  let last: WukongClip | null = null;
  const refill = () => {
    bag = [...clips];
    for (let index = bag.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [bag[index], bag[swap]] = [bag[swap]!, bag[index]!];
    }
    if (bag.length > 1 && bag[0] === last) {
      [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1]!, bag[0]!];
    }
  };
  return () => {
    if (bag.length === 0) refill();
    const next = bag.shift() ?? clips[0]!;
    last = next;
    return next;
  };
}

export const WukongPet = memo(function WukongPet({
  mood,
  width,
  playing = true,
  rotationMs = WORKING_CLIP_ROTATION_MS,
  clip: forcedClip,
}: {
  mood: PetMood;
  width: number;
  playing?: boolean;
  /** How often the working exercise changes. */
  rotationMs?: number;
  /** Play this clip regardless of mood; previews use it to tour every clip. */
  clip?: WukongClip;
}) {
  const shuffle = useRef<(() => WukongClip) | null>(null);
  if (shuffle.current === null) shuffle.current = createClipShuffle();
  const [workingClip, setWorkingClip] = useState<WukongClip>(() => shuffle.current!());

  useEffect(() => {
    if (mood !== "working" || forcedClip) return;
    const timer = setInterval(() => setWorkingClip(shuffle.current!()), rotationMs);
    return () => clearInterval(timer);
  }, [mood, rotationMs, forcedClip]);

  const clip = forcedClip ?? (mood === "working" ? workingClip : wukongClipForMood(mood));
  const frames = useWukongClip(clip);
  if (!frames) {
    return <div style={{ width: `${width}px`, height: `${Math.round(width * 0.9)}px` }} />;
  }
  return <AsciiAnimation clip={frames} width={width} playing={playing} className="neo-ascii-pet" />;
});
