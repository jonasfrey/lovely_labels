/**
 * Convert tiffs/*.tif → tile_masters/*.png (server-only, full-resolution)
 *                    + client/public/tiles/*.thumb.png (≤64 px, shipped)
 * and write client/public/tiles/manifest.json so the client can list them.
 *
 * Why two output dirs: the 4096 px source TIFs are licensed artwork that we
 * don't want to ship to the browser. The server keeps a 2048 px greyscale
 * master and serves resolution-bucketed copies on demand via /api/tile.
 * The client only receives thumbnails.
 *
 * Falls back to scanning horizontal_tiles/ if tiffs/ is absent so older
 * checkouts keep working.
 */

const ROOT = new URL("..", import.meta.url).pathname;
const CANDIDATE_SRC_DIRS = [`${ROOT}tiffs`, `${ROOT}horizontal_tiles`];
const MASTERS_DIR = `${ROOT}tile_masters`;
const THUMBS_DIR = `${ROOT}client/public/tiles`;
const MASTER_WIDTH = 2048;
const THUMB_MAX = 64;

// Same env var the server honours, so one .env controls every magick call.
// Defaults to ImageMagick 7's `magick`; set MAGICK_BIN=convert for IM6 systems.
const MAGICK_BIN = Deno.env.get("MAGICK_BIN") ?? "magick";

// `identify` is a `magick` subcommand under IM7 but a standalone binary under
// IM6, so derive the right invocation from MAGICK_BIN.
const IDENTIFY_BIN = MAGICK_BIN === "magick" ? "magick" : "identify";
const IDENTIFY_PREFIX = MAGICK_BIN === "magick" ? ["identify"] : [];

interface ManifestEntry {
  id: string;
  thumb: string;
  naturalWidth: number;
  naturalHeight: number;
  maxWidth: number;
}

async function ensureDir(path: string): Promise<void> {
  await Deno.mkdir(path, { recursive: true });
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isDirectory;
  } catch {
    return false;
  }
}

async function runMagick(args: string[]): Promise<void> {
  const cmd = new Deno.Command(MAGICK_BIN, {
    args,
    stderr: "piped",
    stdout: "piped",
  });
  const { code, stderr } = await cmd.output();
  if (code !== 0) {
    const msg = new TextDecoder().decode(stderr);
    throw new Error(`magick ${args.join(" ")} failed: ${msg}`);
  }
}

async function identifyDims(path: string): Promise<{ w: number; h: number }> {
  const cmd = new Deno.Command(IDENTIFY_BIN, {
    args: [...IDENTIFY_PREFIX, "-format", "%w %h", `${path}[0]`],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  if (code !== 0) {
    throw new Error(`identify failed: ${new TextDecoder().decode(stderr)}`);
  }
  const [w, h] = new TextDecoder().decode(stdout).trim().split(/\s+/).map(
    Number,
  );
  return { w, h };
}

function slugify(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function removeStaleFulls(): Promise<void> {
  // The legacy pipeline wrote <id>.png next to <id>.thumb.png into the client
  // bundle. Those are the high-res tiles we no longer want to ship — drop them
  // so subsequent builds don't leave bundled copies behind.
  try {
    for await (const e of Deno.readDir(THUMBS_DIR)) {
      if (!e.isFile) continue;
      if (e.name.endsWith(".thumb.png")) continue;
      if (!e.name.endsWith(".png")) continue;
      await Deno.remove(`${THUMBS_DIR}/${e.name}`).catch(() => {});
    }
  } catch {
    // dir may not exist yet — ensureDir below will create it.
  }
}

async function findSrcDir(): Promise<string | null> {
  for (const d of CANDIDATE_SRC_DIRS) {
    if (await dirExists(d)) return d;
  }
  return null;
}

async function main(): Promise<void> {
  const srcDir = await findSrcDir();
  if (!srcDir) {
    console.warn(
      `No source dir found (tried ${CANDIDATE_SRC_DIRS.join(", ")})`,
    );
    return;
  }
  console.log(`Source: ${srcDir}`);

  await ensureDir(MASTERS_DIR);
  await ensureDir(THUMBS_DIR);
  await removeStaleFulls();

  const files: string[] = [];
  for await (const entry of Deno.readDir(srcDir)) {
    if (entry.isFile && /\.tiff?$/i.test(entry.name)) files.push(entry.name);
  }
  files.sort();

  if (files.length === 0) {
    console.warn(`No .tif files in ${srcDir}`);
  }

  const entries: ManifestEntry[] = [];
  let i = 0;
  for (const name of files) {
    i++;
    const id = slugify(name);
    const srcPath = `${srcDir}/${name}`;
    const masterPath = `${MASTERS_DIR}/${id}.png`;
    const thumbPath = `${THUMBS_DIR}/${id}.thumb.png`;

    console.log(`[${i}/${files.length}] ${name} → ${id}`);

    await runMagick([
      `${srcPath}[0]`,
      "-colorspace",
      "Gray",
      "-depth",
      "8",
      "-resize",
      `${MASTER_WIDTH}x`,
      "-strip",
      "PNG8:" + masterPath,
    ]);
    await runMagick([
      masterPath,
      "-resize",
      `${THUMB_MAX}x${THUMB_MAX}`,
      "-strip",
      "PNG8:" + thumbPath,
    ]);

    const masterDims = await identifyDims(masterPath);
    entries.push({
      id,
      thumb: `${id}.thumb.png`,
      naturalWidth: masterDims.w,
      naturalHeight: masterDims.h,
      maxWidth: masterDims.w,
    });
  }

  const manifestPath = `${THUMBS_DIR}/manifest.json`;
  await Deno.writeTextFile(
    manifestPath,
    JSON.stringify({ tiles: entries }, null, 2),
  );
  console.log(`Wrote ${entries.length} tile(s) to ${manifestPath}`);
}

if (import.meta.main) {
  await main();
}
