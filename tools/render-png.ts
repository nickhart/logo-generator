/**
 * Headless isometric render to PNG. The lab is the interactive view; this is
 * the one that works in a terminal, CI, or a code review.
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { buildLogo, DEFAULT_LOGO_OPTIONS } from "../src/geometry/compose.js";
import { getPalette, resolveColor } from "../src/palette.js";
import type { Vec3 } from "../src/geometry/types.js";

const W = 900;
const H = 900;
const BG: [number, number, number] = [20, 22, 26];

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
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

function png(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // no per-scanline filter
    rgb.subarray(y * width * 3, (y + 1) * width * 3).forEach((v, i) => {
      raw[y * (width * 3 + 1) + 1 + i] = v;
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
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const paletteName = process.argv[process.argv.indexOf("--palette") + 1];
const palette = getPalette(
  process.argv.includes("--palette") && paletteName ? paletteName : "n64",
);
const outPath =
  (process.argv.includes("--out") && process.argv[process.argv.indexOf("--out") + 1]) ||
  "out/preview.png";

const mesh = buildLogo(DEFAULT_LOGO_OPTIONS);

// Centre the model on its own bounding box and note its radius, so the camera
// frames whatever the placements produce rather than assuming the model
// straddles the origin.
let minB = { x: Infinity, y: Infinity, z: Infinity };
let maxB = { x: -Infinity, y: -Infinity, z: -Infinity };
for (const t of mesh.triangles) {
  for (const v of [t.a, t.b, t.c]) {
    minB = { x: Math.min(minB.x, v.x), y: Math.min(minB.y, v.y), z: Math.min(minB.z, v.z) };
    maxB = { x: Math.max(maxB.x, v.x), y: Math.max(maxB.y, v.y), z: Math.max(maxB.z, v.z) };
  }
}
const centre: Vec3 = {
  x: (minB.x + maxB.x) / 2,
  y: (minB.y + maxB.y) / 2,
  z: (minB.z + maxB.z) / 2,
};

let radius = 0;
for (const t of mesh.triangles) {
  for (const v of [t.a, t.b, t.c]) {
    radius = Math.max(radius, Math.hypot(v.x - centre.x, v.y - centre.y, v.z - centre.z));
  }
}

// True isometric: 45 degrees around, and atan(1/sqrt 2) up.
const yaw = Math.PI / 4;
const pitch = Math.atan(1 / Math.SQRT2);
// Pull back far enough that the bounding sphere fits, with a little air.
const halfFov = Math.PI / 12;
const dist = (radius / Math.sin(halfFov)) * 1.05;
const eye: Vec3 = {
  x: dist * Math.cos(pitch) * Math.sin(yaw),
  y: dist * Math.sin(pitch),
  z: dist * Math.cos(pitch) * Math.cos(yaw),
};
const zAxis = norm(sub(eye, { x: 0, y: 0, z: 0 }));
const xAxis = norm(cross({ x: 0, y: 1, z: 0 }, zAxis));
const yAxis = cross(zAxis, xAxis);
const focal = 1 / Math.tan(halfFov);

const color = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  color[i * 3] = BG[0];
  color[i * 3 + 1] = BG[1];
  color[i * 3 + 2] = BG[2];
}
const depth = new Float64Array(W * H).fill(Infinity);

const project = (p: Vec3): [number, number, number] | null => {
  const rel = sub({ x: p.x - centre.x, y: p.y - centre.y, z: p.z - centre.z }, eye);
  const v = { x: dot(xAxis, rel), y: dot(yAxis, rel), z: dot(zAxis, rel) };
  if (v.z >= -1e-6) return null;
  return [
    ((focal * v.x) / -v.z / 2 + 0.5) * W,
    (0.5 - (focal * v.y) / -v.z / 2) * H,
    -v.z,
  ];
};

const light = norm({ x: 0.4, y: 0.75, z: 0.55 });
const edgeFn = (
  ax: number, ay: number, bx: number, by: number, px: number, py: number,
): number => (bx - ax) * (py - ay) - (by - ay) * (px - ax);

for (const tri of mesh.triangles) {
  const p0 = project(tri.a);
  const p1 = project(tri.b);
  const p2 = project(tri.c);
  if (!p0 || !p1 || !p2) continue;

  const base = resolveColor(palette, tri.colorSlot, tri.kind);
  const lambert = Math.max(dot(norm(tri.normal), light), 0);
  const shade = 0.82 + 0.18 * lambert;
  const rgb = [base.r * shade, base.g * shade, base.b * shade];

  const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
  const minPy = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
  const maxPy = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));

  for (let py = minPy; py <= maxPy; py++) {
    for (let px = minX; px <= maxX; px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      const w0 = edgeFn(p1[0], p1[1], p2[0], p2[1], cx, cy);
      const w1 = edgeFn(p2[0], p2[1], p0[0], p0[1], cx, cy);
      const w2 = edgeFn(p0[0], p0[1], p1[0], p1[1], cx, cy);
      const inside = (w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0);
      if (!inside) continue;
      const sum = w0 + w1 + w2;
      if (Math.abs(sum) < 1e-12) continue;
      const z = (w0 * p0[2] + w1 * p1[2] + w2 * p2[2]) / sum;
      const idx = py * W + px;
      if (z >= depth[idx]!) continue;
      depth[idx] = z;
      color[idx * 3] = Math.round(rgb[0]!);
      color[idx * 3 + 1] = Math.round(rgb[1]!);
      color[idx * 3 + 2] = Math.round(rgb[2]!);
    }
  }
}

writeFileSync(outPath, png(W, H, color));
console.log(`wrote ${outPath} (${W}x${H}, palette ${palette.name})`);
