import type { Mesh } from "../geometry/types.js";
import { resolveColor, toHex, type Palette } from "../palette.js";

/**
 * Flat typed-array-friendly form for the browser lab: positions, normals and
 * per-vertex colours, ready to hand straight to a WebGL buffer.
 */
export interface MeshJson {
  palette: string;
  triangleCount: number;
  positions: number[];
  normals: number[];
  colors: number[];
  /** The resolved swatches, for the lab's legend. */
  swatches: { slot: number; kind: string; hex: string }[];
}

export function toJson(mesh: Mesh, palette: Palette): MeshJson {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const seen = new Map<string, { slot: number; kind: string; hex: string }>();

  for (const tri of mesh.triangles) {
    const c = resolveColor(palette, tri.colorSlot, tri.kind);
    const key = `${tri.colorSlot}_${tri.kind}`;
    if (!seen.has(key)) {
      seen.set(key, { slot: tri.colorSlot, kind: tri.kind, hex: toHex(c) });
    }
    for (const v of [tri.a, tri.b, tri.c]) {
      positions.push(v.x, v.y, v.z);
      normals.push(tri.normal.x, tri.normal.y, tri.normal.z);
      colors.push(c.r / 255, c.g / 255, c.b / 255);
    }
  }

  return {
    palette: palette.name,
    triangleCount: mesh.triangles.length,
    positions,
    normals,
    colors,
    swatches: [...seen.values()],
  };
}
