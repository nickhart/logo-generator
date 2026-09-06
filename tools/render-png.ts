/**
 * Headless isometric render to PNG. The lab is the interactive view; this is
 * the one that works in a terminal, CI, or a code review.
 */
import { writeFileSync } from "node:fs";
import { buildLogo, DEFAULT_LOGO_OPTIONS } from "../src/geometry/compose.js";
import { getPalette } from "../src/palette.js";
import { renderPng } from "../src/render/raster.js";

const arg = (name: string): string | undefined =>
  process.argv.includes(`--${name}`)
    ? process.argv[process.argv.indexOf(`--${name}`) + 1]
    : undefined;

const size = Number(arg("size") ?? 900);
const palette = getPalette(arg("palette") ?? "n64");
const outPath = arg("out") ?? "out/preview.png";
// The logo is the deliverable, so an alpha background is often what you want:
// it drops onto any surface without carrying a colour along with it.
const transparent = process.argv.includes("--transparent");
// Crop to the logo and fill the frame. The isometric view otherwise leaves the
// mark on under half the canvas, off-centre.
const fitArg = arg("fit");
const fit = process.argv.includes("--fit")
  ? // The value is optional, so ignore whatever follows if it is another flag.
    Number(fitArg && !fitArg.startsWith("--") ? fitArg : 0.04)
  : undefined;

// Degrees above the horizon. The default is a shallow view that favours the
// letterforms; pass 35.26 for a true isometric projection.
const pitchArg = arg("pitch");
const camera =
  pitchArg !== undefined && Number.isFinite(Number(pitchArg))
    ? { pitch: (Number(pitchArg) * Math.PI) / 180 }
    : undefined;

const mesh = buildLogo(DEFAULT_LOGO_OPTIONS);
writeFileSync(
  outPath,
  renderPng(mesh, palette, {
    size,
    transparent,
    ...(fit !== undefined && Number.isFinite(fit) ? { fit } : {}),
    ...(camera ? { camera } : {}),
  }),
);

console.log(
  `wrote ${outPath} (${size}x${size}, palette ${palette.name}` +
    `${transparent ? ", transparent" : ""}${fit !== undefined ? ", fitted" : ""})`,
);
