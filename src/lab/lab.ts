/**
 * Browser preview for the generated logo.
 *
 * Geometry and the base palette come from the generator's JSON export; the lab
 * re-resolves colours itself so palette edits are instant and don't need a
 * regenerate. Shading follows the same slot/face-kind rule as src/palette.ts,
 * which is what keeps the preview honest.
 */

interface MeshData {
  palette: string;
  triangleCount: number;
  positions: number[];
  normals: number[];
  colors: number[];
  swatches: { slot: number; kind: string; hex: string }[];
}

interface LabState {
  /** Base hue per colour slot, as hex. */
  slots: string[];
  shading: { front: number; back: number; side: number };
  /** Which slot and face kind each vertex belongs to. */
  slotOf: number[];
  kindOf: number[];
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
const FRAG = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec3 n = normalize(vNormal);
  float lambert = max(dot(n, normalize(vec3(0.4, 0.75, 0.55))), 0.0);
  gl_FragColor = vec4(vColor * (0.82 + 0.18 * lambert), 1.0);
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
  const gl = canvas.getContext("webgl", { antialias: true });
  if (!gl) throw new Error("WebGL is unavailable in this browser");

  const mesh: MeshData = await (await fetch("./model.json")).json();

  // Rebuild slot/kind per vertex from the swatch list so the palette controls
  // can recolour without re-fetching geometry.
  const slotOf: number[] = [];
  const kindOf: number[] = [];
  const vertCount = mesh.positions.length / 3;
  {
    const byHex = new Map(mesh.swatches.map((s) => [s.hex.toLowerCase(), s]));
    for (let i = 0; i < vertCount; i++) {
      const r = Math.round(mesh.colors[i * 3]! * 255);
      const g = Math.round(mesh.colors[i * 3 + 1]! * 255);
      const b = Math.round(mesh.colors[i * 3 + 2]! * 255);
      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      const sw = byHex.get(hex);
      slotOf.push(sw ? sw.slot : 0);
      kindOf.push(sw ? KINDS.indexOf(sw.kind as Kind) : 0);
    }
  }

  // Seed the slot colours from the generated swatches: a "front" face carries
  // the unshaded hue, so those are the base colours.
  const slots = ["#069330", "#0222a9", "#ff1813", "#ffc001"];
  for (const sw of mesh.swatches) {
    if (sw.kind === "front") slots[sw.slot] = sw.hex;
  }

  const state: LabState = {
    slots,
    shading: { front: 1.0, back: 0.72, side: 0.86 },
    slotOf,
    kindOf,
  };

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) ?? "program link failed");
  }
  gl.useProgram(prog);

  // Centre the model on the origin so orbiting feels anchored.
  const pos = new Float32Array(mesh.positions);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) {
    minY = Math.min(minY, pos[i]!);
    maxY = Math.max(maxY, pos[i]!);
  }
  const midY = (minY + maxY) / 2;
  for (let i = 1; i < pos.length; i += 3) pos[i]! -= midY;

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
      const [r, g, b] = hexToRgb(state.slots[state.slotOf[i]!]!);
      const kind = KINDS[state.kindOf[i]!] ?? "front";
      const f = state.shading[kind];
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
    gl!.clearColor(0.078, 0.086, 0.102, 1);
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
  const slotsEl = document.getElementById("slots")!;
  state.slots.forEach((hex, i) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<label>slot ${i}</label>`;
    const input = document.createElement("input");
    input.type = "color";
    input.value = hex;
    input.addEventListener("input", () => {
      state.slots[i] = input.value;
      refreshColors();
    });
    row.appendChild(input);
    slotsEl.appendChild(row);
  });

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
  document.getElementById("copy")!.addEventListener("click", () => {
    const json = JSON.stringify(
      {
        name: "custom",
        colors: state.slots.map((h) => {
          const [r, g, b] = hexToRgb(h);
          return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
        }),
        shading: state.shading,
      },
      null,
      2,
    );
    void navigator.clipboard.writeText(json);
    const btn = document.getElementById("copy")!;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = "Copy palette JSON"), 1200);
  });

  document.getElementById("tris")!.textContent = String(mesh.triangleCount);
  document.getElementById("size")!.textContent = "60 × 57 × 60";

  refreshColors();
  render();
}

void main().catch((err: unknown) => {
  document.body.innerHTML =
    `<pre style="color:#ff8080;padding:20px;font:13px monospace">${String(err)}</pre>`;
});
