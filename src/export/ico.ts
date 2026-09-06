/**
 * Pack PNGs into an .ico.
 *
 * Browsers still request /favicon.ico by default, and the format is a container:
 * one file holds several sizes and the browser picks the one it wants. Since
 * Vista an entry may be a PNG verbatim rather than a BMP, which is what this
 * writes -- every browser that matters reads it, and it keeps the alpha the
 * renderer already produced.
 */

export interface IcoEntry {
  size: number;
  png: Buffer;
}

export function toIco(entries: IcoEntry[]): Buffer {
  if (entries.length === 0) throw new Error("an .ico needs at least one image");

  // ICONDIR: reserved, type 1 (icon), image count.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dirSize = 16 * entries.length;
  let offset = header.length + dirSize;

  const dir: Buffer[] = [];
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    // 0 means 256 in this field, which is why it is a byte.
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette size: 0, true colour
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    offset += png.length;
  }

  return Buffer.concat([header, ...dir, ...entries.map((e) => e.png)]);
}
