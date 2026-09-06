import type { FaceKind, Triangle } from "./geometry/types.js";
import type { FaceDirection } from "./geometry/direction.js";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * A palette colours the logo one of two ways.
 *
 * `slot` is the original model: each letter is assigned hues for its caps and
 * its sides, and a per-face-kind multiplier dims the sides so edges stay
 * readable. Colour belongs to the letter.
 *
 * `direction` instead colours by which way a face points, so every surface
 * facing the same way matches whichever letter it came from. Colour belongs to
 * the logo. These are flat by design -- stepping brightness per face kind would
 * make two faces of the same assigned colour render differently, which is the
 * one thing this mode exists to avoid.
 */
export type Palette = SlotPalette | DirectionPalette;

export interface SlotPalette {
  name: string;
  mode: "slot";
  /** The four hues cycled around the logo, in slot order. */
  colors: [Rgb, Rgb, Rgb, Rgb];
  /**
   * Per-face-kind brightness multipliers. The original model is flat/self-illuminated,
   * so front and back sit at full strength and only the extruded sides are stepped
   * down, which is what gives the logo its readable edges.
   */
  shading: Record<FaceKind, number>;
}

export interface DirectionPalette {
  name: string;
  mode: "direction";
  colors: Record<FaceDirection, Rgb>;
  /**
   * The palette's full set of hues, including any this arrangement does not
   * currently use. Kept so the palette stays a complete description of the
   * scheme rather than only the parts the NH logo happens to need.
   */
  swatches?: Record<string, Rgb>;
}

const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });

const hex = (s: string): Rgb => {
  const n = parseInt(s.replace("#", ""), 16);
  return rgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

/**
 * The original N64 colours, taken from the values Shadowth117 documented in the
 * model's Readme rather than from the .mtl, which has them rounded.
 */
export const N64_PALETTE: SlotPalette = {
  name: "n64",
  mode: "slot",
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

const NIGHT_OWL = {
  blue: hex("#82AAFF"),
  teal: hex("#7FDBCA"),
  green: hex("#ADDB67"),
  purple: hex("#C792EA"),
  amber: hex("#FFCB8B"),
  coral: hex("#F78C6C"),
  navy: hex("#011627"),
};

/**
 * Night Owl, coloured by face direction.
 *
 * Opposite faces share a colour -- north with south, east with west -- so the
 * logo reads the same from the front and from behind.
 *
 * Every face is a mid-tone. Navy started out on the east/west faces, but it is
 * the scheme's background value: against a dark ground those faces dropped out
 * entirely, and the logo lost a whole letter. It stays in `swatches` as the
 * backdrop colour it is, and coral is the one hue still spare.
 */
export const NIGHTOWL_PALETTE: DirectionPalette = {
  name: "nightowl",
  mode: "direction",
  colors: {
    north: NIGHT_OWL.blue,
    south: NIGHT_OWL.blue,
    east: NIGHT_OWL.purple,
    west: NIGHT_OWL.purple,
    up: NIGHT_OWL.teal,
    down: NIGHT_OWL.amber,
    diagonal: NIGHT_OWL.green,
  },
  swatches: NIGHT_OWL,
};

/** Registry so a new palette is one entry, not a code change. */
export const PALETTES: Record<string, Palette> = {
  n64: N64_PALETTE,
  nightowl: NIGHTOWL_PALETTE,
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

/**
 * The final colour for a face.
 *
 * A slot palette takes its hue from the face's slot and steps it by face kind;
 * a direction palette takes it from which way the face points, flat.
 */
export function resolveColor(palette: Palette, tri: Triangle): Rgb {
  if (palette.mode === "direction") {
    return palette.colors[tri.direction ?? "north"];
  }
  const base = palette.colors[tri.colorSlot];
  const factor = palette.shading[tri.kind];
  return rgb(
    clamp255(base.r * factor),
    clamp255(base.g * factor),
    clamp255(base.b * factor),
  );
}

/**
 * A stable key for the faces that share a colour, for exports that group by
 * material. Slot palettes vary by slot and kind; direction palettes by
 * direction alone.
 */
export function colorKey(palette: Palette, tri: Triangle): string {
  return palette.mode === "direction"
    ? (tri.direction ?? "north")
    : `${tri.colorSlot}_${tri.kind}`;
}

export const toHex = (c: Rgb): string =>
  `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
