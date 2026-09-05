import { memo } from "react";

/**
 * A CSS rabbit: an egg-shaped body with the tail, eye, and feet drawn as
 * box-shadows of one pseudo-element and ears as the other.
 * Everything is measured in `em`, so `size` only sets the font size; the
 * hop and kick loops are transform keyframes in neo.css. The scene spans
 * 9em by 6em.
 */
const SCENE_WIDTH_EM = 9;
const SCENE_HEIGHT_EM = 6;

export const RabbitPet = memo(function RabbitPet({
  size,
  playing = true,
}: {
  size: number;
  playing?: boolean;
}) {
  const fontSize = size / SCENE_WIDTH_EM;
  return (
    <div
      aria-hidden
      className="neo-rabbit-scene"
      data-playing={playing ? "true" : "false"}
      style={{
        fontSize: `${fontSize}px`,
        width: `${SCENE_WIDTH_EM}em`,
        height: `${SCENE_HEIGHT_EM}em`,
      }}
    >
      <div className="neo-rabbit" />
    </div>
  );
});
