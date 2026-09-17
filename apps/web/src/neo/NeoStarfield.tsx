import { memo, useMemo, type CSSProperties } from "react";

import { cn } from "~/lib/utils";

/**
 * The Neo sidebar header art: a warm starfield with faint concentric rings
 * a few breathing embers, drawn once as SVG. Stars twinkle through stepped
 * opacity keyframes in three staggered groups (see neo/neo.css), which is a
 * handful of tiny fills per second rather than a continuous repaint.
 */
const STAR_COUNT = 64;
const WIDTH = 480;
/** The header itself is the top half; the bottom half is the tail that thins out below it. */
const HEADER_HEIGHT = 96;
const HEIGHT = HEADER_HEIGHT * 2;

interface Star {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly group: 0 | 1 | 2;
  readonly bright: boolean;
}

/** Deterministic pseudo-random layout so the art never shifts between renders. */
function starLayout(): ReadonlyArray<Star> {
  const stars: Star[] = [];
  let seed = 7;
  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  let index = 0;
  while (stars.length < STAR_COUNT) {
    const x = Math.round(next() * WIDTH);
    const y = Math.round(4 + next() * (HEIGHT - 8));
    const r = next() < 0.2 ? 1.6 : next() < 0.5 ? 1.1 : 0.7;
    const bright = next() < 0.3;
    const keep = next();
    // Full density over the header, then quickly fewer stars the further
    // below it a candidate falls, so the field relaxes into the sidebar
    // instead of stopping at the header's edge.
    const below = Math.max(0, y - HEADER_HEIGHT) / HEADER_HEIGHT;
    if (keep > 1 - below * 0.9) continue;
    stars.push({ x, y, r, group: (index % 3) as 0 | 1 | 2, bright });
    index += 1;
  }
  return stars;
}

export const NeoStarfield = memo(function NeoStarfield() {
  const stars = useMemo(starLayout, []);
  return (
    <svg
      aria-hidden
      className="neo-starfield h-full w-full"
      preserveAspectRatio="xMidYMin slice"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* The ring glow behind the brand's moon is `.neo-brand-glow` on the brand
          itself: the brand is pinned to the right and the art scales with the
          sidebar, so a glow drawn here could not stay under the moon. */}
      {stars.map((star) => (
        <circle
          key={`${star.x}-${star.y}`}
          className={`neo-star neo-star-${star.group}`}
          cx={star.x}
          cy={star.y}
          r={star.r}
          fill={star.bright ? "#f7b487" : "#ffedd9"}
        />
      ))}
      {/* Embers: a few larger dots that breathe slowly. */}
      <g fill="#f1a629">
        <circle className="neo-ember" cx="118" cy="22" r="2.2" />
        <circle className="neo-ember neo-ember-1" cx="212" cy="66" r="1.8" />
        <circle className="neo-ember neo-ember-2" cx="330" cy="30" r="2" />
        <circle className="neo-ember neo-ember-1" cx="420" cy="74" r="1.6" />
        <circle className="neo-ember neo-ember-2" cx="40" cy="78" r="1.4" />
      </g>
    </svg>
  );
});

type SkyShape = "sparkle" | "star" | "starOutline" | "burst" | "dot";
type SkyMotion = "still" | "twinkle-0" | "twinkle-1" | "twinkle-2" | "flare-0" | "flare-1";

interface SkyStar {
  /** Percent of the host. */
  readonly x: number;
  readonly y: number;
  /** Pixels. */
  readonly size: number;
  readonly shape: SkyShape;
  readonly bright: boolean;
  /** Resting opacity; animated stars rise to full from here. */
  readonly dim: number;
  /** Halo strength, 0..1. */
  readonly glow: number;
  readonly motion: SkyMotion;
  /** Seconds, so animated stars never pulse in unison. */
  readonly delay: number;
}

/** A classic n-point star centered at 0,0 with outer radius 1. */
function starPath(points: number, inner: number): string {
  const steps: string[] = [];
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? 1 : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / points;
    const x = Math.round(Math.cos(angle) * radius * 1000) / 1000;
    const y = Math.round(Math.sin(angle) * radius * 1000) / 1000;
    steps.push(`${index === 0 ? "M" : "L"}${x} ${y}`);
  }
  return `${steps.join(" ")} Z`;
}

const SKY_PATHS: Record<Exclude<SkyShape, "dot">, string> = {
  // Four concave points: the classic sparkle.
  sparkle: "M0 -1 Q0 0 1 0 Q0 0 0 1 Q0 0 -1 0 Q0 0 0 -1 Z",
  star: starPath(5, 0.45),
  starOutline: starPath(5, 0.45),
  burst: starPath(8, 0.5),
};

const SKY_VARIANTS = {
  /* Spread over the whole column, middle and bottom included, with only a
     slight pull towards the top where the header art's tail already thins out. */
  sidebar: { count: 56, seed: 11, biasX: 1, biasY: 1.1, corner: 0 },
  /* Everywhere along the bar, plus a cluster in the top-right corner (down to
     under the buttons) that stays visible when the header actions are folded away. */
  topbar: { count: 26, seed: 23, biasX: 1, biasY: 1, corner: 9 },
} as const;

export type NeoStarSkyVariant = keyof typeof SKY_VARIANTS;

function pickShape(roll: number): SkyShape {
  if (roll < 0.34) return "sparkle";
  if (roll < 0.5) return "star";
  if (roll < 0.66) return "starOutline";
  if (roll < 0.8) return "burst";
  return "dot";
}

function pickMotion(roll: number, index: number): SkyMotion {
  if (roll < 0.45) return "still";
  if (roll < 0.8) return `twinkle-${(index % 3) as 0 | 1 | 2}`;
  return `flare-${(index % 2) as 0 | 1}`;
}

/**
 * Deterministic layout per variant, so the sky never shifts between renders.
 * A bias above 1 on an axis pulls stars towards its start.
 */
function skyLayout(variant: NeoStarSkyVariant): ReadonlyArray<SkyStar> {
  const { count, corner, seed: seedStart, biasX, biasY } = SKY_VARIANTS[variant];
  const stars: SkyStar[] = [];
  let seed = seedStart;
  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let index = 0; index < count + corner; index += 1) {
    const shape = pickShape(next());
    // Small enough that the shapes read as glints, not icons.
    const base = shape === "dot" ? 2 : shape === "star" || shape === "starOutline" ? 3 : 3.5;
    const spread = shape === "dot" ? 1 : shape === "burst" ? 3 : 3.5;
    const inCorner = index >= count;
    stars.push({
      x: inCorner
        ? Math.round((86 + next() * 11) * 10) / 10
        : Math.round((3 + next() ** biasX * 94) * 10) / 10,
      y: inCorner
        ? Math.round((10 + next() * 84) * 10) / 10
        : Math.round((3 + next() ** biasY * 94) * 10) / 10,
      size: Math.round(base + next() * spread),
      shape,
      bright: next() < 0.3,
      dim: Math.round((0.3 + next() * 0.35) * 100) / 100,
      glow: Math.round((0.25 + next() * 0.75) * 100) / 100,
      motion: pickMotion(next(), index),
      delay: Math.round(next() * 60) / 10,
    });
  }
  return stars;
}

/**
 * Small star shapes (sparkles, five-point stars, bursts, dots) scattered over
 * a host: the sidebar or the chat top bar. Each has its own halo strength and
 * resting brightness; about half twinkle or flare on long stepped keyframes
 * (see neo/neo.css), so a handful of tiny opacity steps per second is all it
 * costs. Sits at z-index -1 inside an isolated host, above its background and
 * below its content. Only the Neo look shows it.
 */
export const NeoStarSky = memo(function NeoStarSky({
  variant,
  className,
}: {
  variant: NeoStarSkyVariant;
  className?: string;
}) {
  const stars = useMemo(() => skyLayout(variant), [variant]);
  return (
    <div aria-hidden className={cn("neo-star-sky", className)}>
      {stars.map((star) => (
        <span
          key={`${star.shape}-${star.x}-${star.y}`}
          className={cn(
            "neo-sky-star",
            star.bright && "neo-sky-star-bright",
            star.motion !== "still" && `neo-sky-${star.motion}`,
          )}
          style={
            {
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              "--dim": star.dim,
              "--glow": star.glow,
              animationDelay: `${star.delay}s`,
            } as CSSProperties
          }
        >
          <svg viewBox="-1 -1 2 2" xmlns="http://www.w3.org/2000/svg">
            {star.shape === "dot" ? (
              <circle r="0.7" fill="currentColor" />
            ) : star.shape === "starOutline" ? (
              <path
                d={SKY_PATHS.starOutline}
                fill="none"
                stroke="currentColor"
                strokeWidth="0.22"
                strokeLinejoin="round"
              />
            ) : (
              <path d={SKY_PATHS[star.shape]} fill="currentColor" />
            )}
          </svg>
        </span>
      ))}
    </div>
  );
});
