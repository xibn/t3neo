import { MoonStarIcon } from "lucide-react";
import { memo } from "react";

/**
 * The quiet pet: the brand's moon-star inside the starfield's ring glow, drawn
 * once with no background and nothing that moves. It keeps the badge, the
 * hover activity list and the click-to-open behaviour of the other pets, so
 * the corner still tells you what the agents are doing without an animation.
 */
export const LunarPet = memo(function LunarPet({ size }: { size: number }) {
  const iconSize = Math.max(12, Math.round(size * 0.34));
  return (
    <div
      className="neo-lunar-pet relative flex shrink-0 items-center justify-center"
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="neo-lunar-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#f2a26e" stopOpacity="0.28" />
            <stop offset="1" stopColor="#f2a26e" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#neo-lunar-glow)" />
        <g fill="none" stroke="#f2a26e" strokeOpacity="0.14">
          <circle cx="60" cy="60" r="27" />
          <circle cx="60" cy="60" r="42" />
          <circle cx="60" cy="60" r="57" />
        </g>
      </svg>
      <MoonStarIcon
        className="relative text-[#f1a629]"
        style={{
          width: `${iconSize}px`,
          height: `${iconSize}px`,
          filter: "drop-shadow(0 0 6px rgb(241 166 41 / 55%))",
        }}
        strokeWidth={1.75}
      />
    </div>
  );
});
