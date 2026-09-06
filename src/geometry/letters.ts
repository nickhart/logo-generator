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
 * the right stem and lands at the foot of the left one. Offsetting that centre
 * line by a stroke gives the diagonal's two long edges, which keeps it the same
 * visual weight as the stems.
 *
 * The diagonal runs this way -- rather than the top-left-to-bottom-right a
 * standalone N would use -- because the logo's placement turns this letter a
 * half turn to face out of the box, which mirrors it. Authoring it mirrored is
 * what makes it read as an N once placed.
 */
function outlineN(m: LetterMetrics): Outline {
  const { width: w, height: h, stroke: s } = m;

  // The diagonal is a parallelogram of horizontal width `stroke` rising from the
  // letter's bottom-left corner to its top-right: its lower face goes
  // (s, 0) -> (w, h) and its upper face (0, 0) -> (w - s, h). Where those faces
  // cross the stems' inner edges is what the outline needs, so solve for it
  // rather than baking in the heights.
  const yOn = (x: number, ax: number, ay: number, bx: number, by: number) =>
    ay + ((by - ay) * (x - ax)) / (bx - ax);
  const upperAtLeftStem = yOn(s, 0, 0, w - s, h);
  const lowerAtRightStem = yOn(w - s, s, 0, w, h);

  // Traced from the top-right corner. This is the unmirrored N's trace with
  // every x reflected to w - x and the order reversed, which is what keeps the
  // winding consistent with the other letters.
  return [
    p(w, h),
    p(w - s, h),
    // Down the diagonal's upper face to the left stem, then up its inner edge.
    p(s, upperAtLeftStem),
    p(s, h),
    p(0, h),
    p(0, 0),
    p(s, 0),
    // Up the diagonal's lower face to the right stem, then down its inner edge.
    p(w - s, lowerAtRightStem),
    p(w - s, 0),
    p(w, 0),
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
