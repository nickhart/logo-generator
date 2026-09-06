import type { Mesh, Vec3 } from "../geometry/types.js";

/**
 * The camera the exporters share.
 *
 * Every renderer has to agree on framing, or the PNG, the SVG and the favicons
 * of the same logo would not line up. Keeping the projection in one place is
 * what guarantees that.
 *
 * The view is isometric in arrangement -- 45 degrees around, looking down at a
 * fixed angle -- but the default pitch is shallower than a true isometric one.
 * See `DEFAULT_PITCH`.
 */

const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export interface Camera {
  /** Project a model-space point to pixels, or null if it is behind the eye. */
  project(p: Vec3): [number, number, number] | null;
  eye: Vec3;
}

/**
 * True isometric: atan(1/sqrt 2) ~= 35.26 degrees, the angle at which all three
 * axes foreshorten equally.
 *
 * Faithful to the geometry, but a steep look -- the top faces get nearly as
 * much area as the fronts, so the logo reads as much like a plan view as an
 * elevation and the letters squash vertically. Kept for anything that wants the
 * textbook projection.
 */
export const ISO_PITCH = Math.atan(1 / Math.SQRT2);

/**
 * The default pitch: 20 degrees.
 *
 * Shallow enough that the N and the H read as letters rather than as a stack of
 * lids, while still giving the top faces enough area to register as a surface
 * -- which matters for a direction palette, where the tops carry their own
 * colour. Below about 15 degrees they thin to slivers and that colour drops out
 * of the logo entirely.
 */
export const DEFAULT_PITCH = (20 * Math.PI) / 180;

export interface CameraOptions {
  /** Radians above the horizon. Defaults to `DEFAULT_PITCH`. */
  pitch?: number;
  /** Radians around the vertical axis. Defaults to 45 degrees. */
  yaw?: number;
}

/**
 * Frame a mesh isometrically: 45 degrees around, atan(1/sqrt 2) up.
 *
 * The camera is derived from the mesh's own bounds rather than hand-tuned
 * numbers, so it frames whatever the placements produce.
 */
export function isometricCamera(
  mesh: Mesh,
  width: number,
  height: number,
  opts: CameraOptions = {},
): Camera {
  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const t of mesh.triangles) {
    for (const v of [t.a, t.b, t.c]) {
      min = {
        x: Math.min(min.x, v.x),
        y: Math.min(min.y, v.y),
        z: Math.min(min.z, v.z),
      };
      max = {
        x: Math.max(max.x, v.x),
        y: Math.max(max.y, v.y),
        z: Math.max(max.z, v.z),
      };
    }
  }
  const centre: Vec3 = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };

  let radius = 0;
  for (const t of mesh.triangles) {
    for (const v of [t.a, t.b, t.c]) {
      radius = Math.max(
        radius,
        Math.hypot(v.x - centre.x, v.y - centre.y, v.z - centre.z),
      );
    }
  }

  const yaw = opts.yaw ?? Math.PI / 4;
  const pitch = opts.pitch ?? DEFAULT_PITCH;
  // Pull back far enough that the bounding sphere fits, with a little air.
  const halfFov = Math.PI / 12;
  const dist = (radius / Math.sin(halfFov)) * 1.05;
  const eye: Vec3 = {
    x: dist * Math.cos(pitch) * Math.sin(yaw),
    y: dist * Math.sin(pitch),
    z: dist * Math.cos(pitch) * Math.cos(yaw),
  };
  const zAxis = norm(sub(eye, { x: 0, y: 0, z: 0 }));
  const xAxis = norm(cross({ x: 0, y: 1, z: 0 }, zAxis));
  const yAxis = cross(zAxis, xAxis);
  const focal = 1 / Math.tan(halfFov);

  const project = (p: Vec3): [number, number, number] | null => {
    const rel = sub(
      { x: p.x - centre.x, y: p.y - centre.y, z: p.z - centre.z },
      eye,
    );
    const v = {
      x: dot(rel, xAxis),
      y: dot(rel, yAxis),
      z: dot(rel, zAxis),
    };
    if (v.z >= -1e-6) return null;
    return [
      ((focal * v.x) / -v.z / 2 + 0.5) * width,
      (0.5 - (focal * v.y) / -v.z / 2) * height,
      -v.z,
    ];
  };

  return { project, eye };
}
