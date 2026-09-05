import { memo } from "react";

import type { PetId } from "../neoSettings";
import { AsciiAnimation } from "./AsciiAnimation";
import { NOTHING_FRAMES, type PetMood } from "./petRegistry";
import { LunarPet } from "./LunarPet";
import { RabbitPet } from "./RabbitPet";
import { WukongPet } from "./WukongPet";

/** Renders the chosen pet at `size` pixels wide for the given mood. */
export const PetSprite = memo(function PetSprite({
  pet,
  mood,
  size,
  playing = true,
  rotationMs,
}: {
  pet: PetId;
  mood: PetMood;
  size: number;
  playing?: boolean;
  /** How often Wukong changes exercise while working. */
  rotationMs?: number;
}) {
  switch (pet) {
    case "rabbit":
      return <RabbitPet size={size} playing={playing} />;
    case "lunar":
      return <LunarPet size={size} />;
    case "wukong":
      return (
        <WukongPet
          mood={mood}
          width={size}
          playing={playing}
          {...(rotationMs !== undefined ? { rotationMs } : {})}
        />
      );
    case "none":
      return (
        <AsciiAnimation
          clip={NOTHING_FRAMES}
          width={Math.round(size * 0.5)}
          playing={playing}
          className="neo-ascii-pet neo-ascii-nothing"
        />
      );
  }
});
