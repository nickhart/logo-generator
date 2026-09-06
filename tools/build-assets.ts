/**
 * Regenerate the images the README embeds.
 *
 * These are the one exception to everything else this project generates: they
 * are checked in, under assets/, because a public repo's README needs an image
 * that actually renders on GitHub -- out/ is gitignored, so anything written
 * there is invisible on the repo page. Run this after a change that would alter
 * how the logo looks (a placement, a palette, the camera) so the README stays
 * honest.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildLogo, DEFAULT_LOGO_OPTIONS } from "../src/geometry/compose.js";
import { getPalette } from "../src/palette.js";
import { renderPng } from "../src/render/raster.js";
import { toSvg } from "../src/export/svg.js";

const outDir = "assets";
mkdirSync(outDir, { recursive: true });

const mesh = buildLogo(DEFAULT_LOGO_OPTIONS);
const palette = getPalette("nightowl");

writeFileSync(
  `${outDir}/nh-logo.svg`,
  toSvg(mesh, palette, { width: 512, height: 512, fit: 0.04 }),
);
writeFileSync(
  `${outDir}/nh-logo.png`,
  renderPng(mesh, palette, { size: 640, transparent: true, fit: 0.04 }),
);

console.log(`wrote ${outDir}/nh-logo.{svg,png} (palette ${palette.name})`);
