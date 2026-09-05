import type { Mesh } from "../geometry/types.js";

/**
 * Binary STL. Colourless by design -- this is the file that goes to the slicer,
 * where geometry is all that matters.
 */
export function toBinaryStl(mesh: Mesh): Buffer {
  const count = mesh.triangles.length;
  const buf = Buffer.alloc(84 + count * 50);
  buf.write("logo-generator binary STL".padEnd(80, " "), 0, 80, "ascii");
  buf.writeUInt32LE(count, 80);

  let offset = 84;
  for (const tri of mesh.triangles) {
    const values = [
      tri.normal.x, tri.normal.y, tri.normal.z,
      tri.a.x, tri.a.y, tri.a.z,
      tri.b.x, tri.b.y, tri.b.z,
      tri.c.x, tri.c.y, tri.c.z,
    ];
    for (const v of values) {
      buf.writeFloatLE(v, offset);
      offset += 4;
    }
    buf.writeUInt16LE(0, offset);
    offset += 2;
  }
  return buf;
}
