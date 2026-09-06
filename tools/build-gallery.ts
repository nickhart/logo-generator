/**
 * Build the output gallery: every artefact the generator produces, on one page,
 * so the exports can be looked at rather than taken on trust.
 *
 * Renders into out/gallery/ alongside the page in src/gallery/. The page itself
 * is authored, not generated -- it lives in src/ so it survives a clean of
 * out/, which is where everything it displays is written.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLogo, DEFAULT_LOGO_OPTIONS } from "../src/geometry/compose.js";
import { getPalette, type DirectionPalette } from "../src/palette.js";
import { renderPng } from "../src/render/raster.js";
import { toSvg } from "../src/export/svg.js";
import { toIco } from "../src/export/ico.js";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string): string | undefined =>
  process.argv.includes(`--${name}`)
    ? process.argv[process.argv.indexOf(`--${name}`) + 1]
    : undefined;

const outDir = arg("out") ?? "out/gallery";
const palette = getPalette(arg("palette") ?? "nightowl");
mkdirSync(outDir, { recursive: true });

const mesh = buildLogo(DEFAULT_LOGO_OPTIONS);
const ISO_PITCH_DEG = 35.26;

const write = (name: string, data: Buffer | string): void =>
  writeFileSync(join(outDir, name), data);

// Vector, in both palettes, so the two colour models can be compared.
write("nh-logo.svg", toSvg(mesh, palette, { width: 512, height: 512, fit: 0.04 }));
write(
  "nh-n64.svg",
  toSvg(mesh, getPalette("n64"), { width: 512, height: 512, fit: 0.04 }),
);

// Raster, at the default angle and at a true isometric one for comparison.
write("logo-800.png", renderPng(mesh, palette, { size: 800, transparent: true, fit: 0.04 }));
write(
  "logo-iso.png",
  renderPng(mesh, palette, {
    size: 400,
    transparent: true,
    fit: 0.04,
    camera: { pitch: (ISO_PITCH_DEG * Math.PI) / 180 },
  }),
);

// Icons: the same set render-favicon.ts writes.
write(
  "favicon.ico",
  toIco(
    [16, 32, 48].map((size) => ({
      size,
      png: renderPng(mesh, palette, { size, transparent: true, fit: 0.04 }),
    })),
  ),
);
for (const size of [16, 32, 192, 512]) {
  write(
    `favicon-${size}.png`,
    renderPng(mesh, palette, { size, transparent: true, fit: 0.04 }),
  );
}
const navy = (palette as DirectionPalette).swatches?.navy;
write(
  "apple-touch-icon.png",
  renderPng(mesh, palette, {
    size: 180,
    transparent: false,
    fit: 0.1,
    ...(navy
      ? { background: [navy.r, navy.g, navy.b] as [number, number, number] }
      : {}),
  }),
);

copyFileSync(join(here, "..", "src", "gallery", "index.html"), join(outDir, "index.html"));

console.log(`wrote ${outDir}/ (palette ${palette.name})`);
console.log(`  open it with: npm run gallery`);
