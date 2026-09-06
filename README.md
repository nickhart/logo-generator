# logo-generator

A procedural 3D "NH" logo in the style of the Nintendo 64 logo: two extruded
letters meeting at a shared corner post, at right angles to each other.

![preview](out/preview.png)

## What this is for

**The output is a logo image.** The geometry is 3D only because the logo is, and
it exists to be rendered — not to be printed, not to be dropped into a game or a
scene. Nothing here needs to be a watertight, manifold solid, and the generator
deliberately gives that up where doing so makes the render cleaner (see
[Culling](#the-shared-post-and-culling)).

The 3D-printable reference model is exactly that: a **reference**, the source of
the measurements below. It is not the thing being produced. If you ever do want
a printable solid out of this, expect to add a boolean union first.

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
npx tsx tools/render-png.ts --transparent   # ...with an alpha background
```

`generate` takes `--palette <name>`, `--out <dir>` and `--name <basename>`.
`render-png.ts` takes `--palette <name>`, `--out <file>` and `--transparent`.
`lab` reads `PORT` and `PALETTE`.

**`--transparent`** writes RGBA with the background fully transparent, so the
logo drops onto any surface without carrying a colour with it. Alpha is binary:
a pixel is either the logo or it is not. Without the flag the background is the
usual flat dark colour.

### Output files

- **`.stl`** — binary, colourless. Geometry only, for tools that want it. Not
  print-ready: the letters overlap and the shared post is culled, so this is not
  a closed solid.
- **`.obj` + `.mtl`** — one material per (colour slot × face kind), so colours
  survive into anything that reads OBJ.
- **`.json`** — flat position/normal/colour arrays for the lab.

## Colours

Palettes live in `src/palette.ts`, and colour the logo one of two ways.

### Slot palettes

Colour belongs to the **letter**: each placement is assigned hues for its caps
and its sides, and a per-face-kind table dims them so edges stay readable.

```ts
export const N64_PALETTE: SlotPalette = {
  name: "n64",
  mode: "slot",
  colors: [rgb(6,147,48), rgb(2,34,169), rgb(255,24,19), rgb(255,192,1)],
  shading: { front: 1.0, back: 0.72, side: 0.86 },
};
```

The four hues are the values from the original model's Readme. Shading matches
how the original reads: it is self-illuminated and flat, so faces are not lit —
the front sits at full strength and the back and sides step down, which is what
keeps the edges legible.

### Direction palettes

Colour belongs to the **logo**: every face pointing the same way gets the same
colour, whichever letter it came from. So the N's face and the H's side walls
that face that same way are one colour, and the letters read as surfaces of a
single object rather than as two separately-painted letters.

```ts
export const NIGHTOWL_PALETTE: DirectionPalette = {
  name: "nightowl",
  mode: "direction",
  colors: { north: blue, south: blue, east: purple, west: purple,
            up: teal, down: amber, diagonal: green },
};
```

Every face is a mid-tone, deliberately. Navy sat on the east/west faces at
first, but it is the scheme's *background* value: against a dark ground those
faces dropped out and the logo lost a whole letter. Keeping every face clear of
the background's value is what lets the logo survive any backdrop — which the
lab's Backdrop button is there to check.

These are **flat** — no shading table, and the renderers skip their lighting
term. Stepping brightness per face kind would make two faces of the same
assigned colour render differently, which is the one thing this mode exists to
prevent.

The seven directions are defined in `src/geometry/direction.ts`, and they are
also just a useful vocabulary for talking about the logo's surfaces — "the face
of the N" is ambiguous once the letters sit on different walls, `north` is not:

| direction  | points toward | what lands there                          |
| ---------- | ------------- | ----------------------------------------- |
| `north`    | −z            | the N's face, and H side walls facing −z  |
| `south`    | +z            | the N's back, and H side walls facing +z  |
| `east`     | +x            | the H's back, and N side walls facing +x  |
| `west`     | −x            | the H's face, and N side walls facing −x  |
| `up`       | +y            | every top, the H's crossbar included      |
| `down`     | −y            | every bottom, the H's crossbar included   |
| `diagonal` | off-axis      | the long edges of the N's diagonal stroke |

`diagonal` is tested for first, and deliberately so: those normals are about
`(±0.799, ±0.601, 0)`, and that 0.601 in y is large enough that classifying by
the dominant component would file half the diagonal under `up`/`down` and paint
it as a top.

### Swapping one in

Add an entry to `PALETTES` and pass `--palette <name>` (the lab reads `PALETTE`
from the environment instead). Everything downstream — OBJ materials, the lab,
the PNG renderer — picks up either mode. The lab's "Copy palette JSON" button
emits an entry in whichever shape is active, so you can dial colours in visually
and paste the result.

## The lab

`npm run lab` serves an interactive WebGL preview:

- opens on the **isometric** view (45° around, `atan(1/√2)` up), with front/top
  presets and a spin toggle
- drag to orbit, scroll to zoom
- one colour control per slot, or per direction for a direction palette,
  applying the same rules as `src/palette.ts` so the preview stays honest. Each
  offers the palette's **own named hues** as clickable chips, because assigning
  colours is choosing which of a scheme's hues goes where — the colour input on
  the right of each row is the escape hatch for anything off-palette. The
  back/side shading sliders appear only for slot palettes, being meaningless
  for the flat ones.
- **Copy colors block** puts the current assignment on the clipboard as the
  `colors: { ... }` source, hues named rather than spelled out, ready to paste
  straight back into `src/palette.ts`. Trying arrangements in the lab and
  pasting the winner is much faster than editing and restarting.
- `PALETTE=nightowl npm run lab` previews a different palette
- the canvas clears to **transparent**, and the Backdrop button cycles the
  stage behind it: checker (the image-editor convention for "empty", and a
  preview of what `--transparent` writes), dark, and light. Worth cycling —
  a palette that reads well on one ground can disappear against another.

Geometry is rebuilt per request, but **the lab does not hot-reload it**: `tsx`
caches the imported modules, so an edit under `src/geometry/` needs the server
restarted. Editing `src/lab/lab.ts` is fine to just reload, since that is
transpiled per request.

## Layout

```
src/geometry/   letters, triangulation, extrusion, composition, face direction
src/export/     obj+mtl, binary stl, json
src/palette.ts  slot and direction palettes
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

### The shared post, and culling

The letters' solids genuinely intersect inside the shared post, so the mesh is
not a watertight manifold and `npm run verify` does not check for one.

Both letters model that post in full, which means each of its six walls is
covered twice over, by coplanar faces pointing the same way. Left alone those
pairs z-fight, and on the post's two outward walls they sit right on the
silhouette where it shows. `cullPostFaces` in `src/geometry/compose.ts` drops
the duplicates, by two rules:

1. **A cap beats a side.** On the four vertical walls, each letter contributes
   one or the other, so this always picks a winner — and never touches a
   letter's own readable face, because that face is always a cap.
2. **The first placement owns the post's top and bottom.** Those are side
   against side, so rule 1 cannot break the tie. Both letters tile the post's
   full cross-section there, so either choice renders identically; the rule just
   needs to be deterministic.

That takes the NH logo from 80 triangles to 66, removing nothing that was
visible. It also makes the mesh *less* watertight — which is fine here, per
[What this is for](#what-this-is-for). The original model sidesteps the whole
problem by being one fused mesh instead of two overlapping solids, and a boolean
union at that post is what a printable version would want instead.
