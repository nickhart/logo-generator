import type { ColorSlot, Mesh, Triangle, Vec3 } from "./types.js";
import { rotateY, translate, vec3 } from "./vec.js";
import { extrude } from "./extrude.js";
import {
  N64_METRICS,
  letterOutline,
  type LetterId,
  type LetterMetrics,
} from "./letters.js";

export interface LetterPlacement {
  letter: LetterId;
  /** Rotation about the vertical axis, in degrees. */
  rotationDeg: number;
  capSlot: ColorSlot;
  sideSlot: ColorSlot;
}

/**
 * How far each letter's plane sits out from the shared axis.
 *
 * This is the detail that makes the original logo work: the N slabs are not
 * centred on the axis, they are pushed outward so they pinwheel around a hollow
 * core instead of all crowding through the middle. Measured at 21.54 on the
 * original, which is (width / 2 - stroke / 2) for its metrics.
 */
export const planeOffsetFor = (metrics: LetterMetrics): number =>
  metrics.width / 2 - metrics.stroke / 2;

export interface LogoOptions {
  metrics: LetterMetrics;
  placements: LetterPlacement[];
}

/**
 * The "NH" arrangement, following the original logo's construction: each letter
 * sits on its own offset plane and is rotated about the shared vertical axis, so
 * the two interlock around a hollow core the way adjacent N's do in the N64
 * logo.
 *
 * The H is turned 180 rather than 90. At 90 its right stem would land in the
 * same quadrant as the N's, and with both planes pushed out by the same offset
 * the two stems come out exactly coincident -- overlapping face-on, which fuses
 * the solids and leaves the result non-manifold. Opposite sides keeps each
 * letter's stems in their own quadrants, and still reads N-then-H.
 */
export const NH_PLACEMENTS: LetterPlacement[] = [
  { letter: "N", rotationDeg: 0, capSlot: 0, sideSlot: 1 },
  { letter: "H", rotationDeg: 180, capSlot: 2, sideSlot: 3 },
];

export const DEFAULT_LOGO_OPTIONS: LogoOptions = {
  metrics: N64_METRICS,
  placements: NH_PLACEMENTS,
};

function transformTriangle(
  tri: Triangle,
  angleRad: number,
  offset: Vec3,
): Triangle {
  const place = (v: Vec3): Vec3 => translate(rotateY(v, angleRad), offset);
  // Normals rotate but must not pick up the translation.
  const n = rotateY(tri.normal, angleRad);
  return {
    a: place(tri.a),
    b: place(tri.b),
    c: place(tri.c),
    normal: n,
    colorSlot: tri.colorSlot,
    kind: tri.kind,
  };
}

/** Build the composed logo mesh. */
export function buildLogo(options: LogoOptions = DEFAULT_LOGO_OPTIONS): Mesh {
  const { metrics, placements } = options;
  const triangles: Triangle[] = [];

  for (const placement of placements) {
    const outline = letterOutline(placement.letter, metrics);
    const solid = extrude(outline, {
      // Square stroke section, as in the original.
      depth: metrics.stroke,
      capSlot: placement.capSlot,
      sideSlot: placement.sideSlot,
    });

    // Letters are authored from a bottom-left origin. Recentre each one on the
    // shared vertical axis, then push its plane outward so the letters pinwheel
    // around a hollow core the way the original's N slabs do.
    const recentre = vec3(-metrics.width / 2, 0, planeOffsetFor(metrics));
    const angleRad = (placement.rotationDeg * Math.PI) / 180;

    for (const tri of solid.triangles) {
      const centred: Triangle = {
        ...tri,
        a: translate(tri.a, recentre),
        b: translate(tri.b, recentre),
        c: translate(tri.c, recentre),
      };
      triangles.push(transformTriangle(centred, angleRad, vec3(0, 0, 0)));
    }
  }

  return { triangles };
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export function boundsOf(mesh: Mesh): Bounds {
  const min = vec3(Infinity, Infinity, Infinity);
  const max = vec3(-Infinity, -Infinity, -Infinity);
  for (const tri of mesh.triangles) {
    for (const v of [tri.a, tri.b, tri.c]) {
      min.x = Math.min(min.x, v.x);
      min.y = Math.min(min.y, v.y);
      min.z = Math.min(min.z, v.z);
      max.x = Math.max(max.x, v.x);
      max.y = Math.max(max.y, v.y);
      max.z = Math.max(max.z, v.z);
    }
  }
  return { min, max };
}
