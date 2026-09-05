/** A point in the 2D letter design plane (x = advance, y = up). */
export interface Vec2 {
  x: number;
  y: number;
}

/** A point in model space. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Which of the four logo colours a face is painted with.
 *
 * The original N64 logo cycles four hues around the pinwheel; we keep the same
 * four slots so a replacement palette drops straight in.
 */
export type ColorSlot = 0 | 1 | 2 | 3;

/**
 * Where a face sits on the extruded solid. The renderer and the colour
 * assignment both key off this, so shading stays consistent with the original
 * even when the palette changes.
 */
export type FaceKind = "front" | "back" | "side";

/** A single triangle of output geometry. */
export interface Triangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  normal: Vec3;
  colorSlot: ColorSlot;
  kind: FaceKind;
}

/** A complete generated model. */
export interface Mesh {
  triangles: Triangle[];
}
