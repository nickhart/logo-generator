# logo-generator

A procedural 3D "NH" logo in the style of the Nintendo 64 logo: two interlocking
extruded letters pinwheeled around a shared vertical axis.

![preview](out/preview.png)

## Where this came from

`reference/N64-Logo/` holds the original model by Shadowth117 (no credit
required for use). It is a single fused 48-vertex mesh with perfect 4-fold
rotational symmetry — four N slabs welded into one object, with no separable
parts to delete.

So rather than cutting that mesh apart, this project **regenerates** the logo
from measured metrics. The original is the reference; everything shipped here is
built from parameters:

| measurement        | value  | source                                   |
| ------------------ | ------ | ---------------------------------------- |
| letter width       | 60.13  | one N slab's span                        |
| letter height      | 57.46  | model height                             |
| stroke / thickness | 16.9   | stem width, which equals extrusion depth |
| plane offset       | 21.54  | how far each letter sits off the axis    |

The stem width and the extrusion depth being equal is what gives every stroke a
square cross-section, and the plane offset is what makes the letters pinwheel
around a hollow core instead of piling through the middle. Both are load-bearing
if you want a generated letter to look like it belongs to the original.

## Usage

```bash
npm install

npm run generate          # writes out/nh-logo.{obj,mtl,stl,json}
npm run lab               # interactive preview at http://localhost:5173
npx tsx tools/render-png.ts   # headless isometric render to out/preview.png
```

`generate` takes `--palette <name>`, `--out <dir>` and `--name <basename>`.
`lab` reads `PORT` and `PALETTE`.

### Output files

- **`.stl`** — binary, colourless. This is the one for the slicer. Verified
  watertight: two closed solids, no non-manifold edges.
- **`.obj` + `.mtl`** — one material per (colour slot × face kind), so colours
  survive into anything that reads OBJ.
- **`.json`** — flat position/normal/colour arrays for the lab.

## Colours

Palettes live in `src/palette.ts`. A palette is four base hues plus a per-face
shading table:

```ts
export const N64_PALETTE: Palette = {
  name: "n64",
  colors: [rgb(6,147,48), rgb(2,34,169), rgb(255,24,19), rgb(255,192,1)],
  shading: { front: 1.0, back: 0.72, side: 0.86 },
};
```

The four hues are the values from the original model's Readme. Shading matches
how the original reads: it is self-illuminated and flat, so faces are not lit —
the front sits at full strength and the back and sides step down, which is what
keeps the edges legible.

**To swap in your own palette**, add an entry to `PALETTES` and pass
`--palette <name>`. Keep the four slots and the shading table and everything
downstream — OBJ materials, the lab, the PNG renderer — picks it up. The lab's
"Copy palette JSON" button emits an entry in exactly this shape, so you can dial
colours in visually and paste the result.

## The lab

`npm run lab` serves an interactive WebGL preview:

- opens on the **isometric** view (45° around, `atan(1/√2)` up), with front/top
  presets and a spin toggle
- drag to orbit, scroll to zoom
- live colour pickers per slot and sliders for the back/side shading, applying
  the same rule as `src/palette.ts` so the preview stays honest
- geometry is rebuilt per request, so editing the generator and reloading is
  enough to see the change

## Layout

```
src/geometry/   letters, triangulation, extrusion, composition
src/export/     obj+mtl, binary stl, json
src/palette.ts  colour slots and shading
src/lab/        browser preview
tools/          generate, serve-lab, render-png, preview-ascii
reference/      the original N64 model, untouched
```

`tools/preview-ascii.ts` prints the letter outlines as text — the fastest way to
check a letterform after editing `src/geometry/letters.ts`.

## Adding a letter

Add an outline builder in `src/geometry/letters.ts` and register it in
`BUILDERS`. Outlines are closed, counter-clockwise, origin at the bottom-left,
and may be concave — the extruder ear-clips them. Then list it in
`NH_PLACEMENTS` (or your own placement array) with a rotation and colour slots.

One constraint worth knowing: two letters whose stems land in the same quadrant
at the same plane offset come out exactly coincident, which fuses them into a
non-manifold solid. That is why the H here is rotated 180° rather than 90°.
