import type { ColorSlot, FaceKind } from "./geometry/types.js";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Palette {
  name: string;
  /** The four hues cycled around the logo, in slot order. */
  colors: [Rgb, Rgb, Rgb, Rgb];
  /**
   * Per-face-kind brightness multipliers. The original model is flat/self-illuminated,
   * so front and back sit at full strength and only the extruded sides are stepped
   * down, which is what gives the logo its readable edges.
   */
  shading: Record<FaceKind, number>;
}

const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });

/**
 * The original N64 colours, taken from the values Shadowth117 documented in the
 * model's Readme rather than from the .mtl, which has them rounded.
 */
export const N64_PALETTE: Palette = {
  name: "n64",
  colors: [
    rgb(6, 147, 48), // green
    rgb(2, 34, 169), // blue
    rgb(255, 24, 19), // red
    rgb(255, 192, 1), // yellow
  ],
  shading: {
    front: 1.0,
    back: 0.72,
    side: 0.86,
  },
};

/** Registry so a new palette is one entry, not a code change. */
export const PALETTES: Record<string, Palette> = {
  n64: N64_PALETTE,
};

export function getPalette(name: string): Palette {
  const found = PALETTES[name];
  if (!found) {
    const known = Object.keys(PALETTES).join(", ");
    throw new Error(`Unknown palette "${name}". Known palettes: ${known}`);
  }
  return found;
}

const clamp255 = (n: number): number =>
  Math.max(0, Math.min(255, Math.round(n)));

/** The final colour for a face: its slot hue, stepped by its face kind. */
export function resolveColor(
  palette: Palette,
  slot: ColorSlot,
  kind: FaceKind,
): Rgb {
  const base = palette.colors[slot];
  const factor = palette.shading[kind];
  return rgb(
    clamp255(base.r * factor),
    clamp255(base.g * factor),
    clamp255(base.b * factor),
  );
}

export const toHex = (c: Rgb): string =>
  `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
