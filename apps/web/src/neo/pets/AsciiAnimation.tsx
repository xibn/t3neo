import { memo, useEffect, useMemo, useState } from "react";

import type { AsciiFrames } from "./petRegistry";

const FONT_FAMILY =
  '"JetBrains Mono", ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace';
const LINE_HEIGHT = 1.05;
/** Below this font size browsers stop shrinking glyphs reliably, so scale instead. */
const MIN_NATIVE_FONT_PX = 6;

let measuredCharAspect: number | null = null;

/** Advance width of one monospace cell relative to the font size, measured once. */
export function asciiCharAspect(): number {
  if (measuredCharAspect !== null) return measuredCharAspect;
  let aspect = 0.6;
  if (typeof document !== "undefined") {
    const context = document.createElement("canvas").getContext("2d");
    if (context) {
      context.font = `100px ${FONT_FAMILY}`;
      const measured = context.measureText("MMMMMMMMMM").width / 10 / 100;
      if (Number.isFinite(measured) && measured > 0.3 && measured < 1) aspect = measured;
    }
  }
  measuredCharAspect = aspect;
  return aspect;
}

/** The clip's canvas: its declared size, grown to fit any frame that spills past it. */
export function asciiFrameSize(clip: AsciiFrames): {
  readonly columns: number;
  readonly rows: number;
} {
  let columns = clip.columns ?? 1;
  let rows = clip.rows ?? 1;
  for (const frame of clip.frames) {
    const lines = frame.split("\n");
    rows = Math.max(rows, lines.length);
    for (const line of lines) columns = Math.max(columns, line.length);
  }
  return { columns, rows };
}

/** Font size so the widest frame fits `width` pixels. */
export function asciiFontSize(columns: number, width: number): number {
  return width / (columns * asciiCharAspect());
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Steps through ASCII frames on a timer. Pauses while the document is hidden
 * and holds a single frame when the user prefers reduced motion. Frames are
 * text, so each tick swaps one text node in a small box rather than
 * repainting anything larger. The whole frame always fits: the font shrinks
 * with the width, and below the readable minimum the block is scaled down
 * with a transform instead of clipped.
 */
export const AsciiAnimation = memo(function AsciiAnimation({
  clip,
  width,
  playing = true,
  className,
}: {
  clip: AsciiFrames;
  width: number;
  playing?: boolean;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const { columns, rows } = useMemo(() => asciiFrameSize(clip), [clip]);
  const idealFontSize = asciiFontSize(columns, width);
  const fontSize = Math.max(MIN_NATIVE_FONT_PX, idealFontSize);
  const scale = idealFontSize / fontSize;
  const naturalWidth = columns * fontSize * asciiCharAspect();
  const naturalHeight = rows * fontSize * LINE_HEIGHT;

  useEffect(() => {
    setIndex(0);
  }, [clip]);

  useEffect(() => {
    if (!playing || clip.frames.length <= 1 || prefersReducedMotion()) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        setIndex((current) => (current + 1) % clip.frames.length);
      }, clip.delayMs);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clip, playing]);

  return (
    <div
      aria-hidden
      data-neo-ascii=""
      style={{
        width: `${width}px`,
        height: `${Math.ceil(naturalHeight * scale)}px`,
        overflow: "visible",
      }}
    >
      <pre
        className={className}
        style={{
          margin: 0,
          fontSize: `${fontSize}px`,
          lineHeight: LINE_HEIGHT,
          width: `${Math.ceil(naturalWidth)}px`,
          height: `${Math.ceil(naturalHeight)}px`,
          whiteSpace: "pre",
          fontFamily: FONT_FAMILY,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
        }}
      >
        {clip.frames[index] ?? clip.frames[0] ?? ""}
      </pre>
    </div>
  );
});
