import type { Vec2 } from "./types.js";

/** Twice the signed area of the polygon; positive when counter-clockwise. */
export function signedArea2(poly: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

const cross2 = (o: Vec2, a: Vec2, b: Vec2): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = cross2(a, b, p);
  const d2 = cross2(b, c, p);
  const d3 = cross2(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  // Reject only when the point is strictly on both sides, so points sitting
  // exactly on an edge don't block an otherwise valid ear.
  return !(hasNeg && hasPos);
}

/**
 * Ear-clipping triangulation of a simple polygon. The letter outlines are
 * concave (an N's diagonal, an H's crossbar), so a fan won't do.
 *
 * Returns triangles as index triples into the input array, wound
 * counter-clockwise.
 */
export function triangulate(poly: readonly Vec2[]): [number, number, number][] {
  if (poly.length < 3) return [];

  // Work counter-clockwise regardless of how the outline was given to us.
  const ccw = signedArea2(poly) > 0;
  const indices = poly.map((_, i) => i);
  if (!ccw) indices.reverse();

  const out: [number, number, number][] = [];
  const remaining = [...indices];
  // Each successful clip removes a vertex, so this bounds the work even if the
  // polygon turns out to be degenerate.
  let guard = remaining.length * remaining.length;

  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;

    for (let i = 0; i < remaining.length; i++) {
      const iPrev = remaining[(i - 1 + remaining.length) % remaining.length]!;
      const iCurr = remaining[i]!;
      const iNext = remaining[(i + 1) % remaining.length]!;
      const a = poly[iPrev]!;
      const b = poly[iCurr]!;
      const c = poly[iNext]!;

      // A convex corner in a CCW polygon turns left.
      if (cross2(a, b, c) <= 0) continue;

      // It's only an ear if no other vertex of the polygon lies inside it.
      const contains = remaining.some(
        (j) =>
          j !== iPrev &&
          j !== iCurr &&
          j !== iNext &&
          pointInTriangle(poly[j]!, a, b, c),
      );
      if (contains) continue;

      out.push([iPrev, iCurr, iNext]);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }

    // No ear found: the outline isn't a simple polygon. Stop rather than spin.
    if (!clipped) break;
  }

  if (remaining.length === 3) {
    out.push([remaining[0]!, remaining[1]!, remaining[2]!]);
  }
  return out;
}
