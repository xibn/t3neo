/**
 * Renders the T3 Neo app icon (the lucide "moon-star" glyph in amber on a
 * warm dark rounded square) into every production icon slot: macOS, iOS,
 * universal/Linux, Windows .ico, and the web favicons. Run with
 * `node scripts/neo/generate-neo-icons.ts` after changing the artwork.
 */
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - a one-off asset generator, not an Effect program.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";

import { encodePngIco, WINDOWS_ICON_SIZES } from "../lib/icon-export.ts";

const repoRoot = NodePath.resolve(import.meta.dirname, "../..");
const require = NodeModule.createRequire(import.meta.url);

/**
 * The slice of sharp this script uses. sharp is not a workspace dependency,
 * it rides along with electron-builder in the pnpm store, so the module is
 * required at runtime and typed here by hand.
 */
type Sharp = (input: Buffer) => { png(): { toBuffer(): Promise<Buffer> } };

function loadSharp(): Sharp {
  try {
    return require("sharp");
  } catch {
    const store = NodePath.join(repoRoot, "node_modules/.pnpm");
    const candidate = NodeFS.readdirSync(store).find((entry) => entry.startsWith("sharp@"));
    if (!candidate) throw new Error("sharp is not installed");
    return require(NodePath.join(store, candidate, "node_modules/sharp"));
  }
}

const sharp = loadSharp();

const AMBER = "#f2a26e";
const BACKGROUND_TOP = "#1d1815";
const BACKGROUND_BOTTOM = "#0f0d0b";

/** The icon artwork at `size` px. `inset` shrinks the artwork for masks (macOS). */
function iconSvg(size: number, options: { inset?: number; rounded?: boolean } = {}): string {
  const inset = options.inset ?? 0;
  const inner = size - inset * 2;
  const radius = options.rounded === false ? 0 : Math.round(inner * 0.225);
  const glyphScale = (inner / 24) * 0.56;
  const glyphOffset = inset + (inner - 24 * glyphScale) / 2;
  const strokeWidth = 1.9;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BACKGROUND_TOP}"/>
      <stop offset="1" stop-color="${BACKGROUND_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="${AMBER}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="${inset}" y="${inset}" width="${inner}" height="${inner}" rx="${radius}" fill="url(#bg)"/>
  <rect x="${inset}" y="${inset}" width="${inner}" height="${inner}" rx="${radius}" fill="url(#glow)"/>
  <rect x="${inset + inner * 0.012}" y="${inset + inner * 0.012}" width="${inner * 0.976}" height="${inner * 0.976}" rx="${radius * 0.95}" fill="none" stroke="${AMBER}" stroke-opacity="0.18" stroke-width="${inner * 0.012}"/>
  <g transform="translate(${glyphOffset} ${glyphOffset}) scale(${glyphScale})" fill="none" stroke="${AMBER}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    <path d="M20 3v4"/>
    <path d="M22 5h-4"/>
  </g>
</svg>`;
}

async function renderPng(size: number, options?: { inset?: number; rounded?: boolean }) {
  return sharp(Buffer.from(iconSvg(size, options)))
    .png()
    .toBuffer();
}

async function write(relativePath: string, contents: Buffer) {
  const target = NodePath.join(repoRoot, relativePath);
  NodeFS.mkdirSync(NodePath.dirname(target), { recursive: true });
  NodeFS.writeFileSync(target, contents);
  console.log(`wrote ${relativePath} (${contents.length} bytes)`);
}

async function main() {
  // macOS masks its own squircle, so the artwork sits inside the 824px safe area.
  await write("assets/prod/black-macos-1024.png", await renderPng(1024, { inset: 100 }));
  await write("assets/prod/black-ios-1024.png", await renderPng(1024, { rounded: false }));
  await write("assets/prod/black-universal-1024.png", await renderPng(1024));

  const windowsImages = await Promise.all(
    WINDOWS_ICON_SIZES.map(async (size) => ({ size, contents: await renderPng(size) })),
  );
  await write("assets/prod/t3-black-windows.ico", encodePngIco(windowsImages));

  const favicon16 = await renderPng(16);
  const favicon32 = await renderPng(32);
  const favicon48 = await renderPng(48);
  const appleTouch = await renderPng(180, { rounded: false });
  const faviconIco = encodePngIco([
    { size: 16, contents: favicon16 },
    { size: 32, contents: favicon32 },
    { size: 48, contents: favicon48 },
  ]);
  await write("assets/prod/t3-black-web-favicon-16x16.png", favicon16);
  await write("assets/prod/t3-black-web-favicon-32x32.png", favicon32);
  await write("assets/prod/t3-black-web-apple-touch-180.png", appleTouch);
  await write("assets/prod/t3-black-web-favicon.ico", faviconIco);
  await write("apps/web/public/favicon-16x16.png", favicon16);
  await write("apps/web/public/favicon-32x32.png", favicon32);
  await write("apps/web/public/apple-touch-icon.png", appleTouch);
  await write("apps/web/public/favicon.ico", faviconIco);

  await write("assets/prod/logo.svg", Buffer.from(iconSvg(512)));
  await write("assets/neo/app-icon.svg", Buffer.from(iconSvg(1024)));
}

await main();
