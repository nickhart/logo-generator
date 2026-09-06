/**
 * Build a favicon set.
 *
 * Writes favicon.ico (16/32/48, the sizes browsers actually pick between),
 * the PNGs modern browsers prefer, and the Apple touch icon.
 *
 * The touch icon is the one exception to transparency: iOS composites it onto
 * an opaque tile and a transparent one comes out black, so it gets a
 * background.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildLogo, DEFAULT_LOGO_OPTIONS } from "../src/geometry/compose.js";
import { getPalette, type DirectionPalette } from "../src/palette.js";
import { renderPng } from "../src/render/raster.js";
import { toIco } from "../src/export/ico.js";

const arg = (name: string): string | undefined =>
  process.argv.includes(`--${name}`)
    ? process.argv[process.argv.indexOf(`--${name}`) + 1]
    : undefined;

const palette = getPalette(arg("palette") ?? "n64");
const outDir = arg("out") ?? "out";
mkdirSync(outDir, { recursive: true });

const mesh = buildLogo(DEFAULT_LOGO_OPTIONS);

const ICO_SIZES = [16, 32, 48];
const PNG_SIZES = [16, 32, 192, 512];
const TOUCH_SIZE = 180;
// Icons are small, so the logo should fill the frame rather than sit on the
// empty canvas the isometric view leaves around it. A little margin keeps it
// off the edge, and off a rounded corner where the platform adds one.
const FIT = 0.04;
const TOUCH_FIT = 0.1;

const ico = toIco(
  ICO_SIZES.map((size) => ({
    size,
    png: renderPng(mesh, palette, { size, transparent: true, fit: FIT }),
  })),
);
writeFileSync(join(outDir, "favicon.ico"), ico);

for (const size of PNG_SIZES) {
  writeFileSync(
    join(outDir, `favicon-${size}.png`),
    renderPng(mesh, palette, { size, transparent: true, fit: FIT }),
  );
}

// iOS has no transparency here, so pick a ground. A direction palette names its
// own background colour; otherwise fall back to the renderer's dark default.
// It also rounds the corners, so this one gets more margin than the favicons.
const navy = (palette as DirectionPalette).swatches?.navy;
writeFileSync(
  join(outDir, "apple-touch-icon.png"),
  renderPng(mesh, palette, {
    size: TOUCH_SIZE,
    transparent: false,
    fit: TOUCH_FIT,
    ...(navy ? { background: [navy.r, navy.g, navy.b] as [number, number, number] } : {}),
  }),
);

console.log(`wrote ${outDir}/ (palette ${palette.name})`);
console.log(`  favicon.ico            ${ICO_SIZES.join(", ")} px`);
console.log(`  favicon-<n>.png        ${PNG_SIZES.join(", ")} px, transparent`);
console.log(`  apple-touch-icon.png   ${TOUCH_SIZE} px, opaque`);
