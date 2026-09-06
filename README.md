# logo-generator

A procedural 3D "NH" logo in the style of the Nintendo 64 logo: two extruded
letters meeting at a shared corner post, at right angles to each other.

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

The stem width and the extrusion depth being equal is what gives every stroke a
square cross-section -- load-bearing if you want a generated letter to look like
it belongs to the original.

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

- **`.stl`** — binary, colourless. Geometry only, for tools that want it.
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

Placement is explicit: each letter is authored in its own plane occupying
`x in [0, width]`, `z in [0, stroke]`, then rotated about Y and translated.

The original logo is a square tube built from four N's -- each letter is one
wall, and adjacent walls meet at a shared corner post. This logo keeps two of
those walls and leaves the other two empty. Numbering them around the box, wall
1 is `z in [0, s]`, wall 2 is `x in [w - s, w]`, wall 3 is `z in [w - s, w]`,
and wall 4 is `x in [0, s]`. The H takes wall 2 (turned -90°, moved by
`(width, 0, 0)`) and the N takes wall 3 (turned 180°, moved by
`(width, 0, width)`), so the two meet at one square post.

The N's half turn is what points its face out of the box, and it also mirrors
the letter -- so `outlineN` authors the diagonal mirrored, bottom-left to
top-right, which is what makes it read as an N once placed. The reliable way to
derive that outline is to reflect the unmirrored trace (`x -> w - x`) and
reverse the point order to preserve winding; tracing it freehand tends to
produce a self-intersecting polygon.

The letters' solids genuinely intersect inside the shared post, so the mesh is
not a watertight manifold and `npm run verify` does not check for one. Most of
those faces are interior and never visible, but the ones on the post's two
outward walls are coincident and z-fight in the preview. The original avoids
this by being a single fused 48-vertex mesh rather than overlapping solids; if
you ever need a printable single solid, that post is where a boolean union would
go.
