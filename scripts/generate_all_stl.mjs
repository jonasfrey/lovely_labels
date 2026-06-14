//license GPL Jonas Immanuel Frey
// Batch-generate one STL per decorative tile, server-side, with no manual
// clicking. It reuses the real browser pipeline (Canvas2D text + WebGL2 frame
// compositing + three.js STL export) by driving the built headless harness
// (client/headless.html → src/headless.ts) inside headless Chrome.
//
// Usage:
//   deno task build                 # build client incl. headless.html (once)
//   node scripts/generate_all_stl.mjs ["text"] [outDir]
//
// Requires: a built client/dist, Deno (for the server) and Google Chrome.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const TEXT = process.argv[2] ?? "test";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// puppeteer-core is a dev dependency of the client, so resolve it from there.
const require = createRequire(join(REPO_ROOT, "client", "package.json"));
const puppeteer = require("puppeteer-core");
const OUT_DIR = resolve(process.argv[3] ?? resolve(REPO_ROOT, "generated_stl"));
const PORT = 8080;
const BASE = `http://localhost:${PORT}`;

function findChrome() {
  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error("No Chrome/Chromium binary found");
}

async function waitForHealth(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("server did not become healthy in time");
}

function sanitize(s) {
  const cleaned = s.replace(/[^a-zA-Z0-9_\- ]+/g, "").trim().replace(/\s+/g, "_");
  return cleaned || "nameplate";
}

async function main() {
  if (!existsSync(resolve(REPO_ROOT, "client/dist/headless.html"))) {
    throw new Error("client/dist/headless.html missing — run `deno task build` first");
  }
  await mkdir(OUT_DIR, { recursive: true });

  console.log("[gen] starting server…");
  const server = spawn("deno", ["task", "serve"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, PORT: String(PORT) },
  });
  const shutdown = () => {
    if (!server.killed) server.kill("SIGTERM");
  };
  process.on("exit", shutdown);
  process.on("SIGINT", () => { shutdown(); process.exit(130); });

  try {
    await waitForHealth();
    console.log("[gen] server healthy, launching Chrome…");

    const browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        // Software WebGL2 so the frame-compositing shader runs without a GPU.
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });

    try {
      const page = await browser.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") console.error("[page]", msg.text());
      });
      page.on("pageerror", (err) => console.error("[pageerror]", err.message));

      await page.goto(`${BASE}/headless.html`, { waitUntil: "networkidle0" });
      const tileIds = await page.evaluate(() => window.llReady);
      console.log(`[gen] ${tileIds.length} tiles found; text="${TEXT}"`);

      let ok = 0;
      for (const id of tileIds) {
        const b64 = await page.evaluate(
          (t, tileId) => window.llGenerate(t, tileId),
          TEXT,
          id,
        );
        const bytes = Buffer.from(b64, "base64");
        const file = resolve(OUT_DIR, `${sanitize(TEXT)}_${id}.stl`);
        await writeFile(file, bytes);
        ok++;
        console.log(`[gen] (${ok}/${tileIds.length}) ${file} (${bytes.length} bytes)`);
      }
      console.log(`[gen] done — ${ok} STL files written to ${OUT_DIR}`);
    } finally {
      await browser.close();
    }
  } finally {
    shutdown();
  }
}

main().catch((err) => {
  console.error("[gen] failed:", err);
  process.exit(1);
});
