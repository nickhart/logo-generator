/**
 * Render the logo to SVG, for the web.
 *
 * Vector is the right form for a logo on a page: one file at every size, and it
 * stays crisp on any display. The raster renderer is still the one to use where
 * a bitmap is required -- a favicon, an OG image.
 */
import { writeFileSync } from "node:fs";
import { buildLogo, DEFAULT_LOGO_OPTIONS } from "../src/geometry/compose.js";
import { getPalette } from "../src/palette.js";
import { toSvg } from "../src/export/svg.js";

const arg = (name: string): string | undefined =>
  process.argv.includes(`--${name}`)
    ? process.argv[process.argv.indexOf(`--${name}`) + 1]
    : undefined;

const palette = getPalette(arg("palette") ?? "n64");
const outPath = arg("out") ?? "out/nh-logo.svg";
const size = Number(arg("size") ?? 512);
// Transparent unless a background is asked for: a logo on a page should sit on
// whatever is behind it.
const background = arg("background");
// On by default here: an SVG on a page should fill the box it is given, and
// --no-fit is there for when the original framing is wanted.
const fit = process.argv.includes("--no-fit") ? undefined : Number(arg("fit") ?? 0.04);

// Degrees above the horizon. The default is a shallow view that favours the
// letterforms; pass 35.26 for a true isometric projection.
const pitchArg = arg("pitch");
const camera =
  pitchArg !== undefined && Number.isFinite(Number(pitchArg))
    ? { pitch: (Number(pitchArg) * Math.PI) / 180 }
    : undefined;

const mesh = buildLogo(DEFAULT_LOGO_OPTIONS);
const svg = toSvg(mesh, palette, {
  width: size,
  height: size,
  ...(background ? { background } : {}),
  ...(fit !== undefined && Number.isFinite(fit) ? { fit } : {}),
  ...(camera ? { camera } : {}),
});

writeFileSync(outPath, svg);
console.log(
  `wrote ${outPath} (${size}x${size}, palette ${palette.name}` +
    `${background ? `, background ${background}` : ", transparent"}` +
    `, ${(svg.length / 1024).toFixed(1)} kB)`,
);
