import { memo } from "react";

import type { PetId } from "../neoSettings";
import { AsciiAnimation } from "./AsciiAnimation";
import { NOTHING_FRAMES, type PetMood } from "./petRegistry";
import { LunarPet } from "./LunarPet";
import { RabbitPet } from "./RabbitPet";
import { ImportedPetSprite, type SpriteGesture } from "./SpritePet";
import { WukongPet } from "./WukongPet";

/** Renders the chosen pet at `size` pixels wide for the given mood. */
export const PetSprite = memo(function PetSprite({
  pet,
  mood,
  stateKey,
  size,
  playing = true,
  gesture,
}: {
  pet: PetId;
  mood: PetMood;
  /** Changes when the mood's cause changes; imported pets replay their state on it. */
  stateKey?: string;
  size: number;
  playing?: boolean;
  /** Drags and clicks; only the imported pets act them out. */
  gesture?: SpriteGesture;
}) {
  switch (pet) {
    case "none":
      return (
        <AsciiAnimation
          clip={NOTHING_FRAMES}
          width={Math.round(size * 0.5)}
          playing={playing}
          className="neo-ascii-pet neo-ascii-nothing"
        />
      );
    case "rabbit":
      return <RabbitPet size={size} playing={playing} />;
    case "lunar":
      return <LunarPet size={size} />;
    case "wukong":
      return <WukongPet mood={mood} width={size} playing={playing} />;
    default:
      return (
        <ImportedPetSprite
          id={pet}
          mood={mood}
          width={size}
          playing={playing}
          {...(stateKey !== undefined ? { stateKey } : {})}
          {...(gesture !== undefined ? { gesture } : {})}
        />
      );
  }
});
