import { deflateSync } from "node:zlib";
import type { Mesh, Vec3 } from "../geometry/types.js";
import { resolveColor, type Palette } from "../palette.js";
import { isometricCamera } from "./camera.js";

/**
 * Software rasteriser and PNG encoder.
 *
 * Shared so the preview renderer and the favicon builder produce the same
 * image, and so a favicon can be rendered at several sizes in one pass.
 */

export const DEFAULT_BG: [number, number, number] = [20, 22, 26];

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/**
 * Encode a PNG. With `alpha`, writes RGBA (colour type 6) so background pixels
 * can be fully transparent; otherwise truecolour RGB.
 */
export function png(
  width: number,
  height: number,
  pixels: Uint8Array,
  alpha: boolean,
): Buffer {
  const stride = alpha ? 4 : 3;
  const rowBytes = width * stride;
  const raw = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0; // no per-scanline filter
    pixels.subarray(y * rowBytes, (y + 1) * rowBytes).forEach((v, i) => {
      raw[y * (rowBytes + 1) + 1 + i] = v;
    });
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = alpha ? 6 : 2; // truecolour, with or without alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export interface RenderOptions {
  size: number;
  transparent: boolean;
  background?: [number, number, number];
  /**
   * Crop to the logo and rescale it to fill the frame, leaving this fraction of
   * the size as margin on the tightest side.
   *
   * The isometric view leaves a lot of empty canvas -- the mark covers under
   * 40% of it, off-centre -- which is fine for a preview and wasteful for an
   * icon, where every pixel counts. Undefined leaves the framing alone.
   */
  fit?: number;
}

/**
 * Render the mesh to RGBA pixels.
 *
 * Small sizes are supersampled and boxed down: a favicon rendered one sample
 * per pixel leaves the diagonals visibly jagged. Coverage comes from the depth
 * buffer, so a partly covered pixel gets partial alpha and its colour is
 * averaged over only the covered samples -- otherwise the background bleeds
 * into the edges.
 */
export function render(
  mesh: Mesh,
  palette: Palette,
  opts: RenderOptions,
): Uint8Array {
  const { size: W, transparent } = opts;
  const H = W;
  const BG = opts.background ?? DEFAULT_BG;
  // Supersample small output, where one sample per pixel leaves the diagonals
  // visibly jagged. `fit` crops to roughly half the frame, so it needs the
  // extra resolution at any size to keep the same effective sampling.
  const SS = W <= 256 ? 4 : opts.fit !== undefined ? 2 : 1;
  const RW = W * SS;
  const RH = H * SS;

  const camera = isometricCamera(mesh, RW, RH);

  const color = new Uint8Array(RW * RH * 3);
  const depth = new Float64Array(RW * RH).fill(Infinity);

  const light = norm({ x: 0.4, y: 0.75, z: 0.55 });
  const edgeFn = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    px: number,
    py: number,
  ): number => (bx - ax) * (py - ay) - (by - ay) * (px - ax);

  for (const tri of mesh.triangles) {
    const p0 = camera.project(tri.a);
    const p1 = camera.project(tri.b);
    const p2 = camera.project(tri.c);
    if (!p0 || !p1 || !p2) continue;

    const base = resolveColor(palette, tri);
    // A direction palette already says exactly what every face's colour is, so
    // lighting it would defeat the point: two faces assigned the same colour
    // have to render the same. Slot palettes keep the light touch of
    // directional shading that reads as depth.
    const lambert = Math.max(dot(norm(tri.normal), light), 0);
    const shade = palette.mode === "direction" ? 1 : 0.82 + 0.18 * lambert;
    const rgb = [base.r * shade, base.g * shade, base.b * shade];

    const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const maxX = Math.min(RW - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const minPy = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const maxPy = Math.min(RH - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));

    for (let py = minPy; py <= maxPy; py++) {
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        const w0 = edgeFn(p1[0], p1[1], p2[0], p2[1], cx, cy);
        const w1 = edgeFn(p2[0], p2[1], p0[0], p0[1], cx, cy);
        const w2 = edgeFn(p0[0], p0[1], p1[0], p1[1], cx, cy);
        const inside =
          (w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0);
        if (!inside) continue;
        const sum = w0 + w1 + w2;
        if (Math.abs(sum) < 1e-12) continue;
        const z = (w0 * p0[2] + w1 * p1[2] + w2 * p2[2]) / sum;
        const idx = py * RW + px;
        if (z >= depth[idx]!) continue;
        depth[idx] = z;
        color[idx * 3] = Math.round(rgb[0]!);
        color[idx * 3 + 1] = Math.round(rgb[1]!);
        color[idx * 3 + 2] = Math.round(rgb[2]!);
      }
    }
  }

  // Where the logo actually landed in the supersampled buffer. With `fit`, the
  // output samples this box instead of the whole frame.
  let bx0 = 0;
  let by0 = 0;
  let bx1 = RW;
  let by1 = RH;
  if (opts.fit !== undefined) {
    let minX = RW;
    let minY = RH;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        if (depth[y * RW + x] === Infinity) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX >= minX && maxY >= minY) {
      // Square the box off its longer side, so the aspect is preserved and the
      // logo ends up centred rather than stretched.
      const cx = (minX + maxX + 1) / 2;
      const cy = (minY + maxY + 1) / 2;
      const half = Math.max(maxX - minX + 1, maxY - minY + 1) / 2;
      const grown = half / (1 - 2 * opts.fit);
      bx0 = cx - grown;
      by0 = cy - grown;
      bx1 = cx + grown;
      by1 = cy + grown;
    }
  }
  const spanX = (bx1 - bx0) / W;
  const spanY = (by1 - by0) / H;

  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      let samples = 0;
      // Average the source region this output pixel maps to. Without `fit` that
      // is exactly the SS x SS block; with it, whatever the crop implies.
      const sx0 = bx0 + x * spanX;
      const sy0 = by0 + y * spanY;
      const stepX = spanX / SS;
      const stepY = spanY / SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = Math.floor(sx0 + (sx + 0.5) * stepX);
          const py = Math.floor(sy0 + (sy + 0.5) * stepY);
          samples++;
          if (px < 0 || py < 0 || px >= RW || py >= RH) continue;
          const si = py * RW + px;
          if (depth[si] === Infinity) continue;
          covered++;
          r += color[si * 3]!;
          g += color[si * 3 + 1]!;
          b += color[si * 3 + 2]!;
        }
      }
      const o = (y * W + x) * 4;
      if (covered === 0) {
        rgba[o] = transparent ? 0 : BG[0];
        rgba[o + 1] = transparent ? 0 : BG[1];
        rgba[o + 2] = transparent ? 0 : BG[2];
        rgba[o + 3] = transparent ? 0 : 255;
        continue;
      }
      const cr = r / covered;
      const cg = g / covered;
      const cb = b / covered;
      const a = covered / samples;
      if (transparent) {
        rgba[o] = Math.round(cr);
        rgba[o + 1] = Math.round(cg);
        rgba[o + 2] = Math.round(cb);
        rgba[o + 3] = Math.round(a * 255);
      } else {
        rgba[o] = Math.round(cr * a + BG[0] * (1 - a));
        rgba[o + 1] = Math.round(cg * a + BG[1] * (1 - a));
        rgba[o + 2] = Math.round(cb * a + BG[2] * (1 - a));
        rgba[o + 3] = 255;
      }
    }
  }
  return rgba;
}

/** Render straight to an encoded PNG. */
export function renderPng(
  mesh: Mesh,
  palette: Palette,
  opts: RenderOptions,
): Buffer {
  const rgba = render(mesh, palette, opts);
  if (opts.transparent) return png(opts.size, opts.size, rgba, true);
  // Drop the alpha channel when it carries no information.
  const rgb = new Uint8Array(opts.size * opts.size * 3);
  for (let i = 0; i < opts.size * opts.size; i++) {
    rgb[i * 3] = rgba[i * 4]!;
    rgb[i * 3 + 1] = rgba[i * 4 + 1]!;
    rgb[i * 3 + 2] = rgba[i * 4 + 2]!;
  }
  return png(opts.size, opts.size, rgb, false);
}
