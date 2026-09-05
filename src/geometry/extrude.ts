import type { ColorSlot, Mesh, Triangle, Vec2, Vec3 } from "./types.js";
import { faceNormal, vec3 } from "./vec.js";
import { signedArea2, triangulate } from "./triangulate.js";

export interface ExtrudeOptions {
  /** Extrusion depth along +Z, centred on the design plane. */
  depth: number;
  /** Colour slot for the two flat caps. */
  capSlot: ColorSlot;
  /** Colour slot for the extruded side walls. */
  sideSlot: ColorSlot;
}

/**
 * Extrude a closed 2D outline into a solid, giving caps and sides separate
 * colour slots so the pinwheel can be painted the way the original is.
 */
export function extrude(outline: readonly Vec2[], opts: ExtrudeOptions): Mesh {
  const { depth, capSlot, sideSlot } = opts;
  const halfDepth = depth / 2;

  // Normalise winding up front so the side walls below can assume CCW order.
  const wound = signedArea2(outline) > 0 ? [...outline] : [...outline].reverse();

  // Drop repeated points. An outline can legitimately arrive with a duplicate
  // where two segments meet at the same corner (the N's diagonal lands exactly
  // on the foot of its right stem); left in, those become zero-length edges and
  // degenerate side quads, which show up as holes in the exported solid.
  const poly = wound.filter((p, i) => {
    const prev = wound[(i - 1 + wound.length) % wound.length]!;
    return Math.abs(p.x - prev.x) > 1e-9 || Math.abs(p.y - prev.y) > 1e-9;
  });

  const front = (p: Vec2): Vec3 => vec3(p.x, p.y, halfDepth);
  const back = (p: Vec2): Vec3 => vec3(p.x, p.y, -halfDepth);

  const triangles: Triangle[] = [];
  const push = (
    a: Vec3,
    b: Vec3,
    c: Vec3,
    colorSlot: ColorSlot,
    kind: Triangle["kind"],
  ): void => {
    triangles.push({ a, b, c, normal: faceNormal(a, b, c), colorSlot, kind });
  };

  const faces = triangulate(poly);

  // Front cap: CCW seen from +Z, so its normal points out of the front.
  for (const [i, j, k] of faces) {
    push(front(poly[i]!), front(poly[j]!), front(poly[k]!), capSlot, "front");
  }

  // Back cap: same triangles with winding reversed so normals point out of -Z.
  for (const [i, j, k] of faces) {
    push(back(poly[k]!), back(poly[j]!), back(poly[i]!), capSlot, "back");
  }

  // Side walls: one quad per outline edge, wound so normals face outward.
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!;
    const next = poly[(i + 1) % poly.length]!;
    const fa = front(cur);
    const fb = front(next);
    const ba = back(cur);
    const bb = back(next);
    push(fa, ba, bb, sideSlot, "side");
    push(fa, bb, fb, sideSlot, "side");
  }

  return { triangles };
}
