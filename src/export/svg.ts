import type { Mesh } from "../geometry/types.js";
import { colorKey, resolveColor, toHex, type Palette } from "../palette.js";
import { isometricCamera, type CameraOptions } from "../render/camera.js";

export interface SvgOptions {
  width: number;
  height: number;
  /** Painted behind the logo. Omit for a transparent background. */
  background?: string;
  /**
   * Tighten the viewBox to the logo, leaving this fraction of the size as
   * margin. The isometric projection otherwise leaves the mark on well under
   * half the canvas, off-centre, which wastes the space it is given on a page.
   */
  fit?: number;
  /** Camera angles; defaults to true isometric. */
  camera?: CameraOptions;
}

const f = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

/**
 * Render the logo to SVG.
 *
 * Unlike the raster renderer there is no depth buffer, so the triangles are
 * sorted back-to-front and painted in that order. That is sound here because
 * the logo is made of flat-shaded axis-aligned slabs that do not interpenetrate
 * visibly -- the shared corner post is the one place they do, and the cull in
 * compose.ts has already removed the faces buried in it.
 *
 * Faces are grouped into one path per colour. Adjacent coplanar triangles then
 * share a path, which both shrinks the file and stops antialiasing from drawing
 * seams along the diagonals where two triangles meet inside one quad.
 */
interface Painted {
  depth: number;
  color: string;
  key: string;
  points: [number, number][];
  /** Screen-space bounding box, for a cheap overlap reject. */
  box: [number, number, number, number];
  /** Projected vertices with depth, for the in-front test. */
  xyz: [number, number, number][];
}

/** Barycentric depth of a triangle at a screen point, or null if outside it. */
function depthAt(t: Painted, x: number, y: number): number | null {
  const [a, b, c] = t.xyz;
  const d = (b![1] - c![1]) * (a![0] - c![0]) + (c![0] - b![0]) * (a![1] - c![1]);
  if (Math.abs(d) < 1e-9) return null;
  const w0 = ((b![1] - c![1]) * (x - c![0]) + (c![0] - b![0]) * (y - c![1])) / d;
  const w1 = ((c![1] - a![1]) * (x - c![0]) + (a![0] - c![0]) * (y - c![1])) / d;
  const w2 = 1 - w0 - w1;
  const e = -1e-6;
  if (w0 < e || w1 < e || w2 < e) return null;
  return w0 * a![2] + w1 * b![2] + w2 * c![2];
}

/** Points inside a triangle: the centroid, plus corners pulled in toward it. */
function samplePoints(t: Painted): [number, number][] {
  const [a, b, c] = t.xyz;
  const cx = (a![0] + b![0] + c![0]) / 3;
  const cy = (a![1] + b![1] + c![1]) / 3;
  const pts: [number, number][] = [[cx, cy]];
  for (const p of [a!, b!, c!]) {
    for (const w of [0.25, 0.6]) {
      pts.push([p[0] * w + cx * (1 - w), p[1] * w + cy * (1 - w)]);
    }
  }
  // Edge midpoints, pulled in, catch slivers the centroid alone can miss.
  const edges: [typeof a, typeof a][] = [
    [a, b],
    [b, c],
    [c, a],
  ];
  for (const [p, q] of edges) {
    const mx = (p![0] + q![0]) / 2;
    const my = (p![1] + q![1]) / 2;
    pts.push([mx * 0.7 + cx * 0.3, my * 0.7 + cy * 0.3]);
  }
  return pts;
}

/**
 * Order faces back-to-front by actual occlusion, not by a depth scalar.
 *
 * Most triangle pairs in this mesh have overlapping depth ranges -- the letters
 * are perpendicular slabs that each span most of the view -- so no per-triangle
 * depth can order them. What can is asking, for each overlapping pair, which
 * one is nearer at points they both cover, and then sorting to satisfy those
 * constraints.
 *
 * A handful of pairs genuinely occlude each other both ways. Those have no
 * correct paint order at all without splitting a triangle, so the sort simply
 * ignores the cycles they create and keeps its depth-sorted fallback there.
 */
function resolveOcclusion(painted: Painted[]): Painted[] {
  const n = painted.length;
  const overlaps = (a: Painted, b: Painted): boolean =>
    a.box[0] <= b.box[2] &&
    b.box[0] <= a.box[2] &&
    a.box[1] <= b.box[3] &&
    b.box[1] <= a.box[3];

  // after[i] holds the faces that must be painted after i, because i is behind
  // them where the two overlap.
  const after: number[][] = Array.from({ length: n }, () => []);
  const indegree = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = painted[i]!;
      const b = painted[j]!;
      if (!overlaps(a, b)) continue;

      let aNearer = 0;
      let bNearer = 0;
      for (const [x, y] of [...samplePoints(a), ...samplePoints(b)]) {
        const da = depthAt(a, x, y);
        const db = depthAt(b, x, y);
        if (da === null || db === null) continue;
        if (da < db - 1e-6) aNearer++;
        else if (db < da - 1e-6) bNearer++;
      }
      // Mutually occluding: no order is right, so constrain nothing.
      if (aNearer > 0 && bNearer > 0) continue;
      if (aNearer > 0) {
        after[j]!.push(i); // b is behind: paint b, then a
        indegree[i]!++;
      } else if (bNearer > 0) {
        after[i]!.push(j);
        indegree[j]!++;
      }
    }
  }

  // Kahn's algorithm, taking the deepest available face first so the original
  // depth sort breaks ties and fills in wherever constraints are silent.
  const order: Painted[] = [];
  const ready = new Set<number>();
  for (let i = 0; i < n; i++) if (indegree[i] === 0) ready.add(i);

  while (ready.size > 0) {
    let pick = -1;
    for (const i of ready) {
      if (pick === -1 || painted[i]!.depth > painted[pick]!.depth) pick = i;
    }
    ready.delete(pick);
    order.push(painted[pick]!);
    for (const j of after[pick]!) {
      if (--indegree[j]! === 0) ready.add(j);
    }
  }

  // Anything left is in a cycle; append it in depth order.
  if (order.length < n) {
    const placed = new Set(order);
    for (const t of painted) if (!placed.has(t)) order.push(t);
  }
  return order;
}

export function toSvg(mesh: Mesh, palette: Palette, opts: SvgOptions): string {
  const { width, height, background } = opts;
  const camera = isometricCamera(mesh, width, height, opts.camera ?? {});

  const painted: Painted[] = [];
  for (const tri of mesh.triangles) {
    const ps = [tri.a, tri.b, tri.c].map((v) => camera.project(v));
    if (ps.some((p) => p === null)) continue;
    const pts = ps as [number, number, number][];

    // Drop degenerate triangles: they contribute nothing but can add a stray
    // antialiased sliver.
    const area =
      Math.abs(
        (pts[1]![0] - pts[0]![0]) * (pts[2]![1] - pts[0]![1]) -
          (pts[2]![0] - pts[0]![0]) * (pts[1]![1] - pts[0]![1]),
      ) / 2;
    if (area < 1e-6) continue;

    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    painted.push({
      // Sort on the centroid's depth. The farthest corner is tempting but
      // misorders large adjacent faces, because one face's far corner can sit
      // behind another's while the face itself is in front.
      depth: (pts[0]![2] + pts[1]![2] + pts[2]![2]) / 3,
      color: toHex(resolveColor(palette, tri)),
      key: colorKey(palette, tri),
      points: pts.map((p) => [p[0], p[1]] as [number, number]),
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      xyz: pts,
    });
  }

  // Farthest first, so nearer faces paint over them.
  //
  // A depth scalar alone is not enough here: most triangle pairs in this mesh
  // have overlapping depth ranges, because the letters are perpendicular slabs
  // that each span most of the view. So the depth sort is only a starting
  // order, refined below by asking which face is actually in front where the
  // two overlap on screen.
  painted.sort((a, b) => b.depth - a.depth);
  const ordered = resolveOcclusion(painted);

  // Merge each run of same-colour faces into a single path. Only consecutive
  // ones may merge: a run broken by another colour has something painted
  // between, and collapsing across that would reorder the drawing.
  const parts: string[] = [];
  let run: Painted[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const d = run
      .map(
        (t) =>
          `M${t.points.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`,
      )
      .join("");
    // Stroking each shape in its own fill colour closes the hairline seams
    // antialiasing leaves between adjacent triangles of one face.
    const c = run[0]!.color;
    parts.push(`<path fill="${c}" stroke="${c}" d="${d}"/>`);
    run = [];
  };
  for (const t of ordered) {
    if (run.length > 0 && run[0]!.key !== t.key) flush();
    run.push(t);
  }
  flush();

  // Tighten the viewBox to the ink. Squared off the longer side so the aspect
  // is preserved and the logo sits centred.
  let view = { x: 0, y: 0, w: width, h: height };
  if (opts.fit !== undefined && painted.length > 0) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const t of painted) {
      x0 = Math.min(x0, t.box[0]);
      y0 = Math.min(y0, t.box[1]);
      x1 = Math.max(x1, t.box[2]);
      y1 = Math.max(y1, t.box[3]);
    }
    const half = Math.max(x1 - x0, y1 - y0) / 2 / (1 - 2 * opts.fit);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    view = { x: cx - half, y: cy - half, w: half * 2, h: half * 2 };
  }

  const bg = background
    ? `<rect x="${f(view.x)}" y="${f(view.y)}" width="${f(view.w)}" height="${f(view.h)}" fill="${background}"/>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    ` viewBox="${f(view.x)} ${f(view.y)} ${f(view.w)} ${f(view.h)}">`,
    `<title>NH logo</title>`,
    bg,
    `<g shape-rendering="geometricPrecision" stroke-width="0.5">`,
    parts.join(""),
    `</g>`,
    `</svg>`,
  ].join("");
}
