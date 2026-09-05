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
  /** Rotation about the vertical axis, in degrees, applied before `translate`. */
  rotationDeg: number;
  /** Where the rotated letter is placed, in model space. */
  translate: Vec3;
  capSlot: ColorSlot;
  sideSlot: ColorSlot;
}

export interface LogoOptions {
  metrics: LetterMetrics;
  placements: LetterPlacement[];
}

/**
 * The "NH" arrangement: the two letters meet at a single shared corner post and
 * touch nowhere else.
 *
 * Each letter is authored in its own plane occupying x in [0, width] and
 * z in [0, stroke]. The N stays put, so its right stem is the box
 * x in [w - s, w], z in [0, s]. Turning the H 90 degrees about Y swings it into
 * the ZY plane; translating it by (w - s, 0, s) then drops its left stem onto
 * exactly that box. The letters share that one square post, stay perpendicular,
 * and never cut through each other's middles.
 */
export function nhPlacements(m: LetterMetrics): LetterPlacement[] {
  return [
    {
      letter: "N",
      rotationDeg: 0,
      translate: vec3(0, 0, 0),
      capSlot: 0,
      sideSlot: 1,
    },
    {
      letter: "H",
      rotationDeg: 90,
      translate: vec3(m.width - m.stroke, 0, m.stroke),
      capSlot: 2,
      sideSlot: 3,
    },
  ];
}

export const DEFAULT_LOGO_OPTIONS: LogoOptions = {
  metrics: N64_METRICS,
  placements: nhPlacements(N64_METRICS),
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

    // The extruder centres its solid on z = 0. Shift it so the letter occupies
    // z in [0, stroke]: placement is far easier to reason about when a letter's
    // own box starts at the origin.
    const toOrigin = vec3(0, 0, metrics.stroke / 2);
    const angleRad = (placement.rotationDeg * Math.PI) / 180;

    for (const tri of solid.triangles) {
      const based: Triangle = {
        ...tri,
        a: translate(tri.a, toOrigin),
        b: translate(tri.b, toOrigin),
        c: translate(tri.c, toOrigin),
      };
      triangles.push(transformTriangle(based, angleRad, placement.translate));
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
