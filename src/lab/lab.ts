/**
 * Browser preview for the generated logo.
 *
 * Geometry and the base palette come from the generator's JSON export; the lab
 * re-resolves colours itself so palette edits are instant and don't need a
 * regenerate. It follows the same rules as src/palette.ts -- slot and face kind
 * for a slot palette, face direction for a direction one -- which is what keeps
 * the preview honest.
 */

interface Swatch {
  key: string;
  hex: string;
  slot?: number;
  kind?: string;
  direction?: string;
}

interface MeshData {
  palette: string;
  mode: "slot" | "direction";
  triangleCount: number;
  positions: number[];
  normals: number[];
  colors: number[];
  swatches: Swatch[];
  /** Which swatch each vertex belongs to, as an index into `swatches`. */
  swatchOf: number[];
  /** The palette's named hues, offered as the choices for each control. */
  namedColors: { name: string; hex: string }[];
}

interface LabState {
  /**
   * The editable hue behind each swatch, as hex.
   *
   * For a slot palette this is the slot's base colour, which face-kind shading
   * then steps. For a direction palette it is the face colour itself, flat --
   * so the two modes share one control path and differ only in what a control
   * stands for.
   */
  hues: string[];
  shading: { front: number; back: number; side: number };
}

const KINDS = ["front", "back", "side"] as const;
type Kind = (typeof KINDS)[number];

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uProj;
uniform mat4 uView;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vNormal = aNormal;
  vColor = aColor;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

// The original logo is self-illuminated and flat. A light touch of directional
// shading keeps the faces readable in 3D without turning it into a lit object.
//
// uLit switches that off for direction palettes, where the face's colour is
// already fully determined by which way it points: lighting it would make two
// faces of the same assigned colour render differently, which is exactly what
// that mode exists to prevent.
const FRAG = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vColor;
uniform float uLit;
void main() {
  vec3 n = normalize(vNormal);
  float lambert = max(dot(n, normalize(vec3(0.4, 0.75, 0.55))), 0.0);
  float shade = mix(1.0, 0.82 + 0.18 * lambert, uLit);
  gl_FragColor = vec4(vColor * shade, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) ?? "shader compile failed");
  }
  return sh;
}

function perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  // prettier-ignore
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookAt(eye: number[], center: number[], up: number[]) {
  const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
  const norm = (v: number[]) => {
    const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
    return [v[0]! / l, v[1]! / l, v[2]! / l];
  };
  const cross = (a: number[], b: number[]) => [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

  const z = norm(sub(eye, center));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  // prettier-ignore
  return new Float32Array([
    x[0]!, y[0]!, z[0]!, 0,
    x[1]!, y[1]!, z[1]!, 0,
    x[2]!, y[2]!, z[2]!, 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

async function main() {
  const canvas = document.getElementById("gl") as HTMLCanvasElement;
  const gl = canvas.getContext("webgl", {
    antialias: true,
    // An alpha buffer, so clearing to 0 lets the backdrop show through. Without
    // premultiplication the edge pixels blend against the backdrop cleanly
    // rather than picking up a dark fringe.
    alpha: true,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("WebGL is unavailable in this browser");

  const mesh: MeshData = await (await fetch("./model.json")).json();

  const vertCount = mesh.positions.length / 3;
  const shading = { front: 1.0, back: 0.72, side: 0.86 };

  // Seed each control from its swatch. A slot palette's swatches carry shaded
  // colours, so undo the step to recover the base hue -- otherwise editing a
  // slot would bake its own shading in a second time. Direction swatches are
  // already flat.
  const baseHue = (sw: Swatch): string => {
    if (mesh.mode === "direction") return sw.hex;
    const factor = shading[(sw.kind ?? "front") as Kind] || 1;
    const [r, g, b] = hexToRgb(sw.hex).map((v) =>
      Math.round(Math.min(255, (v * 255) / factor)),
    );
    return `#${[r, g, b].map((v) => v!.toString(16).padStart(2, "0")).join("")}`;
  };

  // One control per thing a person actually edits: a slot, or a direction. A
  // slot palette splits each slot across several swatches (one per face kind),
  // and those must move together -- otherwise a slot gets two pickers that each
  // recolour half of it.
  const groupKeyOf = (sw: Swatch): string =>
    mesh.mode === "direction" ? (sw.direction ?? sw.key) : `slot ${sw.slot}`;

  const groups: { label: string; hue: string; swatches: number[] }[] = [];
  const groupAt = new Map<string, number>();
  mesh.swatches.forEach((sw, i) => {
    const key = groupKeyOf(sw);
    let at = groupAt.get(key);
    if (at === undefined) {
      at = groups.length;
      groupAt.set(key, at);
      groups.push({ label: key, hue: baseHue(sw), swatches: [] });
    }
    groups[at]!.swatches.push(i);
  });

  // Which control each swatch follows, so a recolour can look it up per vertex.
  const groupOfSwatch = mesh.swatches.map((sw) => groupAt.get(groupKeyOf(sw))!);

  const state: LabState = { hues: groups.map((g) => g.hue), shading };

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) ?? "program link failed");
  }
  gl.useProgram(prog);
  gl.uniform1f(
    gl.getUniformLocation(prog, "uLit"),
    mesh.mode === "direction" ? 0 : 1,
  );

  // Centre the model on the origin so orbiting feels anchored. All three axes
  // matter: the logo is two walls of a box, so it is off-centre in x and z too.
  const pos = new Float32Array(mesh.positions);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis]!, pos[i]!);
    max[axis] = Math.max(max[axis]!, pos[i]!);
  }
  for (let i = 0; i < pos.length; i++) {
    const axis = i % 3;
    pos[i]! -= (min[axis]! + max[axis]!) / 2;
  }

  const buf = (data: Float32Array, attr: string, size: number) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, attr);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  };

  buf(pos, "aPos", 3);
  buf(new Float32Array(mesh.normals), "aNormal", 3);
  const colorBuf = buf(new Float32Array(mesh.colors), "aColor", 3);

  /** Re-resolve every vertex colour from the current palette and shading. */
  function refreshColors() {
    const out = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
      const swIndex = mesh.swatchOf[i]!;
      const sw = mesh.swatches[swIndex];
      const [r, g, b] = hexToRgb(state.hues[groupOfSwatch[swIndex]!] ?? "#ffffff");
      // Direction palettes are flat: the colour assigned to a face is the
      // colour it renders, or faces meant to match would not.
      const f =
        mesh.mode === "direction"
          ? 1
          : state.shading[(sw?.kind ?? "front") as Kind];
      out[i * 3] = r * f;
      out[i * 3 + 1] = g * f;
      out[i * 3 + 2] = b * f;
    }
    gl!.bindBuffer(gl!.ARRAY_BUFFER, colorBuf);
    gl!.bufferData(gl!.ARRAY_BUFFER, out, gl!.STATIC_DRAW);
  }

  // --- camera ---------------------------------------------------------------
  // The isometric default: equal angles onto all three axes, which is the view
  // that shows both letters at once.
  const ISO = { yaw: Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2) };
  let yaw = ISO.yaw;
  let pitch = ISO.pitch;
  // Frame the model from its own bounds rather than a hand-picked number.
  let radius = 0;
  for (let i = 0; i < pos.length; i += 3) {
    radius = Math.max(radius, Math.hypot(pos[i]!, pos[i + 1]!, pos[i + 2]!));
  }
  const fitDist = (radius / Math.sin(Math.PI / 12)) * 1.05;
  let dist = fitDist;
  let spinning = false;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", (e) => {
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.01;
    pitch += (e.clientY - lastY) * 0.01;
    // Stop short of the poles so "up" never flips mid-drag.
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const next = dist * (1 + e.deltaY * 0.001);
      dist = Math.max(fitDist * 0.35, Math.min(fitDist * 3, next));
    },
    { passive: false },
  );

  function render() {
    if (spinning) yaw += 0.005;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.enable(gl!.DEPTH_TEST);
    // Clear to fully transparent: whatever the stage is wearing shows through,
    // so the backdrop is a CSS concern and the canvas shows only the logo --
    // which is also a preview of what `--transparent` writes to PNG.
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);

    const eye = [
      dist * Math.cos(pitch) * Math.sin(yaw),
      dist * Math.sin(pitch),
      dist * Math.cos(pitch) * Math.cos(yaw),
    ];
    gl!.uniformMatrix4fv(
      gl!.getUniformLocation(prog, "uProj"),
      false,
      perspective(Math.PI / 6, (w || 1) / (h || 1), 1, 2000),
    );
    gl!.uniformMatrix4fv(
      gl!.getUniformLocation(prog, "uView"),
      false,
      lookAt(eye, [0, 0, 0], [0, 1, 0]),
    );
    gl!.drawArrays(gl!.TRIANGLES, 0, vertCount);
    requestAnimationFrame(render);
  }

  // --- controls -------------------------------------------------------------
  // One picker per swatch, labelled by what the swatch stands for: a direction
  // for a direction palette, a slot for a slot one.
  // Each control is a row of the palette's own hues, so assigning a colour is
  // choosing from the scheme rather than dialling in an arbitrary one. The
  // colour input stays on the end as an escape hatch for anything else.
  const slotsEl = document.getElementById("slots")!;
  groups.forEach((group, i) => {
    const row = document.createElement("div");
    row.className = "swatchRow";

    const label = document.createElement("label");
    label.textContent = group.label;
    row.appendChild(label);

    const chips = document.createElement("div");
    chips.className = "chips";

    const custom = document.createElement("input");
    custom.type = "color";
    custom.title = "custom colour";

    const select = (hex: string) => {
      state.hues[i] = hex;
      custom.value = hex;
      // Mark whichever chip matches, so the current choice is visible at a
      // glance across every row.
      for (const chip of Array.from(chips.children)) {
        chip.classList.toggle(
          "on",
          (chip as HTMLElement).dataset.hex === hex.toLowerCase(),
        );
      }
      refreshColors();
    };

    for (const named of mesh.namedColors) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.style.background = named.hex;
      chip.dataset.hex = named.hex.toLowerCase();
      chip.title = named.name;
      chip.addEventListener("click", () => select(named.hex));
      chips.appendChild(chip);
    }
    row.appendChild(chips);

    custom.addEventListener("input", () => select(custom.value));
    row.appendChild(custom);

    slotsEl.appendChild(row);
    select(state.hues[i]!);
  });

  // Shading steps a slot's hue by face kind, which a direction palette has no
  // use for -- it assigns the final colour outright. Hide the sliders there
  // rather than leave controls that do nothing.
  const shadingEl = document.getElementById("shadingControls")!;
  if (mesh.mode === "direction") {
    shadingEl.hidden = true;
  } else {
    const bind = (id: string, key: "back" | "side") => {
      const input = document.getElementById(id) as HTMLInputElement;
      const out = document.getElementById(`${id}Val`)!;
      input.value = String(state.shading[key]);
      out.textContent = input.value;
      input.addEventListener("input", () => {
        state.shading[key] = Number(input.value);
        out.textContent = input.value;
        refreshColors();
      });
    };
    bind("back", "back");
    bind("side", "side");
  }

  const setView = (y: number, p: number) => () => {
    yaw = y;
    pitch = p;
    spinning = false;
  };
  document.getElementById("iso")!.addEventListener("click", setView(ISO.yaw, ISO.pitch));
  document.getElementById("front")!.addEventListener("click", setView(0, 0));
  document.getElementById("top")!.addEventListener("click", setView(0, 1.5));
  document.getElementById("spin")!.addEventListener("click", () => {
    spinning = !spinning;
  });

  // Cycle the stage's backdrop. Checker reads as "empty" the way an image
  // editor does; dark and light are for judging the logo against a real ground,
  // since a palette that works on one can fail on the other.
  const BACKDROPS = ["checker", "dark", "light"] as const;
  const stage = document.getElementById("stage")!;
  const backdropBtn = document.getElementById("backdrop")!;
  let backdrop = 0;
  const applyBackdrop = () => {
    const name = BACKDROPS[backdrop]!;
    stage.classList.toggle("checker", name === "checker");
    stage.classList.toggle("light", name === "light");
    backdropBtn.textContent = name[0]!.toUpperCase() + name.slice(1);
  };
  backdropBtn.addEventListener("click", () => {
    backdrop = (backdrop + 1) % BACKDROPS.length;
    applyBackdrop();
  });
  applyBackdrop();
  const copyLabel =
    mesh.mode === "direction" ? "Copy colors block" : "Copy palette JSON";
  document.getElementById("copy")!.textContent = copyLabel;
  document.getElementById("copy")!.addEventListener("click", () => {
    const toRgb = (h: string) => {
      const [r, g, b] = hexToRgb(h);
      return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
      };
    };
    // Emit whichever palette shape is in play, so the result pastes straight
    // into PALETTES in src/palette.ts.
    // For a direction palette, emit the source line as it would be written in
    // src/palette.ts -- naming the hues rather than spelling out their values,
    // since that is what makes the assignment readable at a glance.
    if (mesh.mode === "direction") {
      const nameOf = new Map(
        mesh.namedColors.map((n) => [n.hex.toLowerCase(), n.name]),
      );
      const body = groups
        .map((g, i) => {
          const hex = state.hues[i]!.toLowerCase();
          const named = nameOf.get(hex);
          return `    ${g.label}: ${named ? `NIGHT_OWL.${named}` : `hex("${hex}")`},`;
        })
        .join("\n");
      void navigator.clipboard.writeText(`  colors: {\n${body}\n  },`);
    } else {
      const payload = {
        name: "custom",
        mode: "slot",
        colors: state.hues.map(toRgb),
        shading: state.shading,
      };
      void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    }
    const btn = document.getElementById("copy")!;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = copyLabel), 1200);
  });

  document.getElementById("paletteName")!.textContent = `· ${mesh.palette}`;
  document.getElementById("tris")!.textContent = String(mesh.triangleCount);
  document.getElementById("size")!.textContent = [0, 1, 2]
    .map((a) => Math.round(max[a]! - min[a]!))
    .join(" × ");

  refreshColors();
  render();
}

void main().catch((err: unknown) => {
  document.body.innerHTML =
    `<pre style="color:#ff8080;padding:20px;font:13px monospace">${String(err)}</pre>`;
});
