import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildLogo, boundsOf, DEFAULT_LOGO_OPTIONS } from "../src/geometry/compose.js";
import { getPalette } from "../src/palette.js";
import { toObj } from "../src/export/obj.js";
import { toBinaryStl } from "../src/export/stl.js";
import { toJson } from "../src/export/json.js";

interface Args {
  palette: string;
  outDir: string;
  name: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { palette: "n64", outDir: "out", name: "nh-logo" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--palette" || arg === "--out" || arg === "--name") && !next) {
      throw new Error(`${arg} needs a value`);
    }
    if (arg === "--palette" && next) { args.palette = next; i++; }
    else if (arg === "--out" && next) { args.outDir = next; i++; }
    else if (arg === "--name" && next) { args.name = next; i++; }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const palette = getPalette(args.palette);
const mesh = buildLogo(DEFAULT_LOGO_OPTIONS);

mkdirSync(args.outDir, { recursive: true });

const mtlName = `${args.name}.mtl`;
const { obj, mtl } = toObj(mesh, palette, mtlName);
writeFileSync(join(args.outDir, `${args.name}.obj`), obj);
writeFileSync(join(args.outDir, mtlName), mtl);
writeFileSync(join(args.outDir, `${args.name}.stl`), toBinaryStl(mesh));
writeFileSync(
  join(args.outDir, `${args.name}.json`),
  JSON.stringify(toJson(mesh, palette)),
);

const b = boundsOf(mesh);
const dim = (a: number, z: number): string => (z - a).toFixed(2);
console.log(`palette:   ${palette.name}`);
console.log(`triangles: ${mesh.triangles.length}`);
console.log(
  `size:      ${dim(b.min.x, b.max.x)} x ${dim(b.min.y, b.max.y)} x ${dim(b.min.z, b.max.z)}`,
);
console.log(`written:   ${args.outDir}/${args.name}.{obj,mtl,stl,json}`);
