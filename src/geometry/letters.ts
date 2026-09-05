import type { Vec2 } from "./types.js";

/**
 * Letter metrics measured off the original N64 logo mesh (reference/N64-Logo).
 *
 * One N slab there spans 60.13 wide by 57.46 tall by 16.86 thick, with stems
 * 16.9 wide -- i.e. the stem width and the extrusion depth match, so every
 * stroke has a square cross-section. Keeping that relationship is what makes a
 * generated letter read as part of the same family as the original.
 */
export interface LetterMetrics {
  width: number;
  height: number;
  /** Stroke width, and also the extrusion depth. */
  stroke: number;
}

export const N64_METRICS: LetterMetrics = {
  width: 60.13,
  height: 57.46,
  stroke: 16.9,
};

/**
 * A closed outline in the design plane, counter-clockwise, origin at the
 * letter's bottom-left.
 */
export type Outline = Vec2[];

const p = (x: number, y: number): Vec2 => ({ x, y });

/**
 * The N64 "N": two full-height stems joined by a diagonal that leaves the top of
 * the left stem and lands at the foot of the right one. Offsetting that centre
 * line by a stroke gives the diagonal's two long edges, which keeps it the same
 * visual weight as the stems.
 */
function outlineN(m: LetterMetrics): Outline {
  const { width: w, height: h, stroke: s } = m;

  // The diagonal is a parallelogram of horizontal width `stroke` running from
  // the letter's top-left corner down to its bottom-right: its upper face goes
  // (0, h) -> (w - s, 0) and its lower face (s, h) -> (w, 0). Where those faces
  // cross the stems' inner edges is what the outline needs, so solve for it
  // rather than baking in the heights.
  const yOn = (x: number, ax: number, ay: number, bx: number, by: number) =>
    ay + ((by - ay) * (x - ax)) / (bx - ax);
  const upperAtLeftStem = yOn(s, 0, h, w - s, 0);
  const lowerAtRightStem = yOn(w - s, s, h, w, 0);

  // Traced counter-clockwise from the bottom-left corner.
  return [
    p(0, 0),
    p(s, 0),
    // Up the left stem's inner edge to the diagonal, then down its upper face.
    p(s, upperAtLeftStem),
    p(w - s, 0),
    p(w, 0),
    p(w, h),
    p(w - s, h),
    // Down the right stem's inner edge, then back up the diagonal's lower face.
    p(w - s, lowerAtRightStem),
    p(s, h),
    p(0, h),
  ];
}

/**
 * An "H" in the same family: the N's two stems, with the diagonal replaced by a
 * horizontal crossbar centred on the letter so the pair carries even weight.
 */
function outlineH(m: LetterMetrics): Outline {
  const { width: w, height: h, stroke: s } = m;
  const barBottom = (h - s) / 2;
  const barTop = (h + s) / 2;
  return [
    p(0, 0),
    p(s, 0),
    p(s, barBottom),
    p(w - s, barBottom),
    p(w - s, 0),
    p(w, 0),
    p(w, h),
    p(w - s, h),
    p(w - s, barTop),
    p(s, barTop),
    p(s, h),
    p(0, h),
  ];
}

export type LetterId = "N" | "H";

const BUILDERS: Record<LetterId, (m: LetterMetrics) => Outline> = {
  N: outlineN,
  H: outlineH,
};

export function letterOutline(id: LetterId, m: LetterMetrics): Outline {
  return BUILDERS[id](m);
}

export const isLetterId = (s: string): s is LetterId => s === "N" || s === "H";
