/**
 * Dev server for the lab: regenerates the model, transpiles the viewer, and
 * serves both from memory so previewing is a single command.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";
import { buildLogo, DEFAULT_LOGO_OPTIONS } from "../src/geometry/compose.js";
import { getPalette } from "../src/palette.js";
import { toJson } from "../src/export/json.js";

const here = dirname(fileURLToPath(import.meta.url));
const labDir = join(here, "..", "src", "lab");
const port = Number(process.env.PORT ?? 5173);
const paletteName = process.env.PALETTE ?? "n64";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0] ?? "/";

  try {
    if (url === "/model.json") {
      // Rebuilt per request so an edit to the geometry shows up on reload.
      const mesh = buildLogo(DEFAULT_LOGO_OPTIONS);
      const body = JSON.stringify(toJson(mesh, getPalette(paletteName)));
      res.writeHead(200, { "content-type": TYPES[".json"]!, "cache-control": "no-store" });
      res.end(body);
      return;
    }

    if (url === "/lab.js") {
      const src = readFileSync(join(labDir, "lab.ts"), "utf8");
      const { code } = transformSync(src, { loader: "ts", format: "esm", target: "es2020" });
      res.writeHead(200, { "content-type": TYPES[".js"]!, "cache-control": "no-store" });
      res.end(code);
      return;
    }

    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": TYPES[".html"]!, "cache-control": "no-store" });
      res.end(readFileSync(join(labDir, "index.html")));
      return;
    }

    res.writeHead(404).end("not found");
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(err));
  }
}).listen(port, () => {
  console.log(`lab:     http://localhost:${port}`);
  console.log(`palette: ${paletteName}`);
});
