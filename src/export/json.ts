import type { Mesh } from "../geometry/types.js";
import { colorKey, resolveColor, toHex, type Palette } from "../palette.js";

/** One group of faces that share a colour, and the colour they resolved to. */
export interface Swatch {
  /** The grouping key: a direction name, or `slot_kind` for slot palettes. */
  key: string;
  hex: string;
  /** Present for slot palettes only. */
  slot?: number;
  kind?: string;
  /** Present for direction palettes only. */
  direction?: string;
}

/**
 * Flat typed-array-friendly form for the browser lab: positions, normals and
 * per-vertex colours, ready to hand straight to a WebGL buffer.
 */
export interface MeshJson {
  palette: string;
  mode: "slot" | "direction";
  triangleCount: number;
  positions: number[];
  normals: number[];
  colors: number[];
  /** The resolved swatches, for the lab's legend and its colour controls. */
  swatches: Swatch[];
  /**
   * The palette's own named hues, whether or not this arrangement uses them.
   *
   * The lab offers these as the choices behind each control: assigning colours
   * is picking which of a scheme's hues goes where, so a fixed set of named
   * options is the right instrument for it -- a freeform colour picker invites
   * hues that are not in the scheme at all.
   */
  namedColors: { name: string; hex: string }[];
  /**
   * Which swatch each vertex belongs to, as an index into `swatches`.
   *
   * The lab recolours without re-fetching geometry, so it needs to know which
   * group every vertex is in. It cannot recover that from the colours alone:
   * a direction palette deliberately gives different groups the same hue.
   */
  swatchOf: number[];
}

export function toJson(mesh: Mesh, palette: Palette): MeshJson {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const swatchOf: number[] = [];
  const index = new Map<string, number>();
  const swatches: Swatch[] = [];

  for (const tri of mesh.triangles) {
    const c = resolveColor(palette, tri);
    const key = colorKey(palette, tri);
    let at = index.get(key);
    if (at === undefined) {
      at = swatches.length;
      index.set(key, at);
      swatches.push(
        palette.mode === "direction"
          ? { key, hex: toHex(c), direction: tri.direction ?? "north" }
          : { key, hex: toHex(c), slot: tri.colorSlot, kind: tri.kind },
      );
    }
    for (const v of [tri.a, tri.b, tri.c]) {
      positions.push(v.x, v.y, v.z);
      normals.push(tri.normal.x, tri.normal.y, tri.normal.z);
      colors.push(c.r / 255, c.g / 255, c.b / 255);
      swatchOf.push(at);
    }
  }

  // A slot palette has no named hues of its own, so fall back to its slots.
  const namedColors =
    palette.mode === "direction"
      ? Object.entries(palette.swatches ?? {}).map(([name, c]) => ({
          name,
          hex: toHex(c),
        }))
      : palette.colors.map((c, i) => ({ name: `slot ${i}`, hex: toHex(c) }));

  return {
    palette: palette.name,
    mode: palette.mode,
    triangleCount: mesh.triangles.length,
    positions,
    normals,
    colors,
    swatches,
    swatchOf,
    namedColors,
  };
}
