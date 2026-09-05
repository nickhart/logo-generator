import type { Vec3 } from "./types.js";

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const sub = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.x - b.x, a.y - b.y, a.z - b.z);

export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

export const length = (a: Vec3): number =>
  Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  // Degenerate triangles would divide by zero; hand back a stable up-vector
  // rather than NaNs that would poison the whole exported file.
  if (len < 1e-9) return vec3(0, 0, 1);
  return vec3(a.x / len, a.y / len, a.z / len);
}

/** Right-handed face normal for a counter-clockwise triangle. */
export const faceNormal = (a: Vec3, b: Vec3, c: Vec3): Vec3 =>
  normalize(cross(sub(b, a), sub(c, a)));

/** Rotate about the Y axis. Angle in radians. */
export function rotateY(v: Vec3, angle: number): Vec3 {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

export const translate = (v: Vec3, by: Vec3): Vec3 =>
  vec3(v.x + by.x, v.y + by.y, v.z + by.z);
