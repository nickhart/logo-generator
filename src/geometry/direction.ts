import type { Vec3 } from "./types.js";

/**
 * Which way a face points in model space.
 *
 * This is the vocabulary for talking about the logo's surfaces. "The face of
 * the N" is ambiguous once the letters are rotated onto different walls of the
 * box -- `north` is not. The names are deliberately letter-independent: a
 * direction palette paints every face that points the same way the same colour,
 * whichever letter it came from.
 *
 * Looking at the logo head-on, with +x to the right and +y up:
 *
 * | direction  | points toward | what lands there                          |
 * | ---------- | ------------- | ----------------------------------------- |
 * | `north`    | -z            | the N's face, and H side walls facing -z  |
 * | `south`    | +z            | the N's back, and H side walls facing +z  |
 * | `east`     | +x            | the H's back, and N side walls facing +x  |
 * | `west`     | -x            | the H's face, and N side walls facing -x  |
 * | `up`       | +y            | every top, the H's crossbar included      |
 * | `down`     | -y            | every bottom, the H's crossbar included   |
 * | `diagonal` | off-axis      | the long edges of the N's diagonal stroke |
 */
export type FaceDirection =
  | "north"
  | "south"
  | "east"
  | "west"
  | "up"
  | "down"
  | "diagonal";

export const FACE_DIRECTIONS: readonly FaceDirection[] = [
  "north",
  "south",
  "east",
  "west",
  "up",
  "down",
  "diagonal",
];

/** How close a component must be to +-1 to count as pointing down that axis. */
const AXIS_EPS = 1e-3;

/**
 * Classify a face normal.
 *
 * Order matters: the off-axis test comes first. The N's diagonal has normals of
 * roughly (+-0.799, +-0.601, 0) -- that 0.601 is large enough that picking the
 * dominant component would file half the diagonal under `up` or `down` and
 * paint it as a top. Anything not squarely on an axis is `diagonal`.
 */
export function classifyDirection(normal: Vec3): FaceDirection {
  const { x, y, z } = normal;
  const onAxis =
    Math.abs(Math.abs(x) - 1) < AXIS_EPS ||
    Math.abs(Math.abs(y) - 1) < AXIS_EPS ||
    Math.abs(Math.abs(z) - 1) < AXIS_EPS;
  if (!onAxis) return "diagonal";

  if (Math.abs(y) > 0.5) return y > 0 ? "up" : "down";
  if (Math.abs(x) > 0.5) return x > 0 ? "east" : "west";
  return z > 0 ? "south" : "north";
}
