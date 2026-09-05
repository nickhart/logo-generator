/** Quick terminal sanity check that the letter outlines are the right shape. */
import { letterOutline, N64_METRICS, type LetterId } from "../src/geometry/letters.js";
import type { Vec2 } from "../src/geometry/types.js";

function inside(poly: Vec2[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      hit = !hit;
    }
  }
  return hit;
}

const COLS = 60;
const ROWS = 24;
for (const id of ["N", "H"] as LetterId[]) {
  const poly = letterOutline(id, N64_METRICS);
  console.log(`\n--- ${id} ---`);
  for (let r = 0; r < ROWS; r++) {
    const y = N64_METRICS.height * (1 - (r + 0.5) / ROWS);
    let line = "";
    for (let c = 0; c < COLS; c++) {
      const x = N64_METRICS.width * ((c + 0.5) / COLS);
      line += inside(poly, x, y) ? "#" : ".";
    }
    console.log(line);
  }
}
