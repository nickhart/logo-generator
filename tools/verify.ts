/**
 * Mesh sanity check.
 *
 * This is a logo renderer, not a print pipeline, so a watertight manifold is
 * not the goal: the letters deliberately share a corner post, and the coincident
 * faces inside that post are never visible. What actually matters is that no
 * triangle is degenerate and every face carries a usable normal and colour --
 * those are the things that show up as artifacts in a render.
 */
import { buildLogo, boundsOf, DEFAULT_LOGO_OPTIONS } from "../src/geometry/compose.js";
import type { Vec3 } from "../src/geometry/types.js";

const key = (v: Vec3): string =>
  `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;

const mesh = buildLogo(DEFAULT_LOGO_OPTIONS);

let degenerate = 0;
let badNormal = 0;
const verts = new Set<string>();

for (const tri of mesh.triangles) {
  const ks = [key(tri.a), key(tri.b), key(tri.c)];
  ks.forEach((k) => verts.add(k));
  if (new Set(ks).size < 3) degenerate++;

  const len = Math.hypot(tri.normal.x, tri.normal.y, tri.normal.z);
  if (!Number.isFinite(len) || Math.abs(len - 1) > 1e-3) badNormal++;
}

const b = boundsOf(mesh);
const size = (lo: number, hi: number): string => (hi - lo).toFixed(2);

console.log(`triangles:    ${mesh.triangles.length}`);
console.log(`vertices:     ${verts.size}`);
console.log(`degenerate:   ${degenerate}`);
console.log(`bad normals:  ${badNormal}`);
console.log(
  `bounds:       ${size(b.min.x, b.max.x)} x ${size(b.min.y, b.max.y)} x ${size(b.min.z, b.max.z)}`,
);

const ok = degenerate === 0 && badNormal === 0 && mesh.triangles.length > 0;
console.log(ok ? "\nOK" : "\nFAIL");
if (!ok) process.exit(1);
