import type { ColorSlot, Mesh, Triangle, Vec3 } from "./types.js";
import { rotateY, translate, vec3 } from "./vec.js";
import { classifyDirection } from "./direction.js";
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
 * The "NH" arrangement: two walls of the square tube the original logo builds
 * out of four N's, with the other two walls left empty.
 *
 * Numbering the walls around the box, wall 1 is z in [0, s], wall 2 is
 * x in [w - s, w], wall 3 is z in [w - s, w], and wall 4 is x in [0, s]. The H
 * takes wall 2 and the N takes wall 3, so the two meet at the corner post
 * x in [w - s, w], z in [w - s, w] -- where the N's own right stem lands.
 *
 * Each letter is authored in its own plane occupying x in [0, width] and
 * z in [0, stroke]. Rotating the H by -90 degrees about Y swings its width onto
 * +z, and translating by (w, 0, 0) lands it on wall 2. Rotating the N by 180
 * degrees and translating by (w, 0, w) lands it on wall 3; the half turn is
 * what points its face out of the box rather than into it.
 */
export function nhPlacements(m: LetterMetrics): LetterPlacement[] {
  return [
    {
      letter: "N",
      rotationDeg: 180,
      translate: vec3(m.width, 0, m.width),
      capSlot: 0,
      sideSlot: 1,
    },
    {
      letter: "H",
      rotationDeg: -90,
      translate: vec3(m.width, 0, 0),
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
    // Classified here rather than in the extruder: the direction wanted is the
    // one in the finished logo, after the letter has been turned onto its wall.
    direction: classifyDirection(n),
  };
}

const EPS = 1e-6;

/** The square post where two walls of the box overlap, in the xz plane. */
interface Post {
  x: [number, number];
  z: [number, number];
}

/**
 * Where the walls overlap: the intersection of the letters' xz footprints.
 *
 * Derived rather than hardcoded so it stays correct if the placements move.
 */
function sharedPost(triangles: Triangle[], owners: number[]): Post | null {
  const boxes = new Map<number, { x: [number, number]; z: [number, number] }>();
  triangles.forEach((tri, i) => {
    const owner = owners[i]!;
    const box = boxes.get(owner) ?? {
      x: [Infinity, -Infinity] as [number, number],
      z: [Infinity, -Infinity] as [number, number],
    };
    for (const v of [tri.a, tri.b, tri.c]) {
      box.x[0] = Math.min(box.x[0], v.x);
      box.x[1] = Math.max(box.x[1], v.x);
      box.z[0] = Math.min(box.z[0], v.z);
      box.z[1] = Math.max(box.z[1], v.z);
    }
    boxes.set(owner, box);
  });

  const all = [...boxes.values()];
  if (all.length < 2) return null;
  const post: Post = {
    x: [
      Math.max(...all.map((b) => b.x[0])),
      Math.min(...all.map((b) => b.x[1])),
    ],
    z: [
      Math.max(...all.map((b) => b.z[0])),
      Math.min(...all.map((b) => b.z[1])),
    ],
  };
  const solid = post.x[1] - post.x[0] > EPS && post.z[1] - post.z[0] > EPS;
  return solid ? post : null;
}

/**
 * Drop the duplicated faces inside the shared corner post.
 *
 * Both letters model that post in full, so each of its six walls is covered
 * twice, by coplanar faces pointing the same way. Those pairs z-fight, and on
 * the post's outward walls they are on the silhouette where it shows.
 *
 * Two rules settle every wall:
 *
 * 1. A cap beats a side. On the four vertical walls each letter contributes one
 *    or the other, so this picks a winner without ever touching a letter's own
 *    readable face -- that face is always a cap.
 * 2. The first placement owns the post's top and bottom. Those are side against
 *    side, so rule 1 cannot break the tie; both letters tile the post's full
 *    cross-section there, so either choice looks identical and the point is
 *    just to pick one deterministically.
 *
 * This trades watertightness for a clean render, which is the right trade here:
 * the output is a logo image, and the STL exists only because the reference
 * model happened to be one. See the note at the top of the README.
 */
function cullPostFaces(triangles: Triangle[], owners: number[]): Triangle[] {
  const post = sharedPost(triangles, owners);
  if (!post) return triangles;

  const inPost = (tri: Triangle): boolean =>
    [tri.a, tri.b, tri.c].every(
      (v) =>
        v.x >= post.x[0] - EPS &&
        v.x <= post.x[1] + EPS &&
        v.z >= post.z[0] - EPS &&
        v.z <= post.z[1] + EPS,
    );

  const firstOwner = owners[0]!;
  return triangles.filter((tri, i) => {
    if (!inPost(tri)) return true;
    const horizontal = Math.abs(tri.normal.y) > 0.5;
    // Rule 2: the post's end caps belong to whichever letter was placed first.
    if (horizontal) return owners[i] === firstOwner;
    // Rule 1: on the vertical walls, the letter's face outranks the other's
    // extruded side wall.
    return tri.kind !== "side";
  });
}

/** Build the composed logo mesh. */
export function buildLogo(options: LogoOptions = DEFAULT_LOGO_OPTIONS): Mesh {
  const { metrics, placements } = options;
  const triangles: Triangle[] = [];
  // Which placement each triangle came from, so the cull can tell the two
  // letters' contributions apart.
  const owners: number[] = [];

  placements.forEach((placement, index) => {
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
      owners.push(index);
    }
  });

  return { triangles: cullPostFaces(triangles, owners) };
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
