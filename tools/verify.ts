/**
 * Mesh integrity check: the exported STL must be watertight, or it will not
 * print. Run after changing anything in src/geometry.
 */
import { buildLogo, DEFAULT_LOGO_OPTIONS } from "../src/geometry/compose.js";
import type { Vec3 } from "../src/geometry/types.js";

const key = (v: Vec3): string =>
  `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;

const mesh = buildLogo(DEFAULT_LOGO_OPTIONS);

const edges = new Map<string, number>();
const verts = new Set<string>();
let degenerate = 0;

for (const tri of mesh.triangles) {
  const ks = [key(tri.a), key(tri.b), key(tri.c)];
  ks.forEach((k) => verts.add(k));
  if (new Set(ks).size < 3) degenerate++;
  for (let i = 0; i < 3; i++) {
    const edge = [ks[i]!, ks[(i + 1) % 3]!].sort().join("|");
    edges.set(edge, (edges.get(edge) ?? 0) + 1);
  }
}

const nonManifold = [...edges.values()].filter((c) => c !== 2).length;
const euler = verts.size - edges.size + mesh.triangles.length;
// Each closed solid contributes 2 to the Euler characteristic.
const solids = euler / 2;

console.log(`triangles:      ${mesh.triangles.length}`);
console.log(`vertices:       ${verts.size}`);
console.log(`edges:          ${edges.size}`);
console.log(`degenerate:     ${degenerate}`);
console.log(`non-manifold:   ${nonManifold}`);
console.log(`euler:          ${euler} (${solids} closed solid${solids === 1 ? "" : "s"})`);

const ok = nonManifold === 0 && degenerate === 0 && Number.isInteger(solids) && solids >= 1;
console.log(ok ? "\nOK - watertight" : "\nFAIL - mesh is not watertight");
if (!ok) process.exit(1);
