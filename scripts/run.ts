//license GPL Jonas Immanuel Frey
// Bootstrap entrypoint for `deno task run`.
//
// Responsibilities, in order:
//   1. Ensure client npm deps are installed (marker file inside node_modules).
//   2. Ensure ImageMagick 7's `magick` binary is reachable — either on PATH
//      or vendored at .tools/magick. On Linux x86_64 we auto-download the
//      official static binary; on other platforms we print install hints
//      and continue (the server will fail tile rendering until the user
//      installs it themselves).
//   3. Ensure tile_masters/ has been built. Both build_tiles.ts and the
//      server need `magick`, so we only run it after step 2 succeeds.
//   4. Chain into `deno task start`, prepending .tools/ to PATH so child
//      processes see our vendored magick.

const ROOT = new URL("..", import.meta.url).pathname;
const TOOLS_DIR = `${ROOT}.tools`;
const VENDORED_MAGICK = `${TOOLS_DIR}/magick`;
const MASTERS_DIR = `${ROOT}tile_masters`;
const MAGICK_URL = "https://imagemagick.org/archive/binaries/magick";

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await Deno.stat(path);
    return s.isFile;
  } catch {
    return false;
  }
}

async function dirHasFiles(path: string): Promise<boolean> {
  try {
    for await (const _ of Deno.readDir(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function childEnv(): Record<string, string> {
  // Inherit, then prepend our vendor dir so `magick` resolves even when the
  // user hasn't put it on their global PATH.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(Deno.env.toObject())) env[k] = v;
  const existing = env["PATH"] ?? "";
  env["PATH"] = existing ? `${TOOLS_DIR}:${existing}` : TOOLS_DIR;
  return env;
}

async function runTask(name: string): Promise<void> {
  console.log(`\n→ deno task ${name}`);
  const cmd = new Deno.Command("deno", {
    args: ["task", name],
    cwd: ROOT,
    env: childEnv(),
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const { code } = await cmd.output();
  if (code !== 0) Deno.exit(code);
}

async function magickAvailable(): Promise<boolean> {
  // Check the vendored copy first so a previous download wins without
  // shelling out. Then fall back to anywhere on PATH.
  if (await fileExists(VENDORED_MAGICK)) return true;
  const path = Deno.env.get("PATH") ?? "";
  for (const dir of path.split(":")) {
    if (!dir) continue;
    if (await fileExists(`${dir}/magick`)) return true;
  }
  return false;
}

async function downloadMagick(): Promise<boolean> {
  if (Deno.build.os !== "linux" || Deno.build.arch !== "x86_64") {
    console.warn(
      `ImageMagick 7 auto-install only supports linux/x86_64 ` +
        `(detected ${Deno.build.os}/${Deno.build.arch}). ` +
        `Install \`magick\` manually so tile rendering can work.`,
    );
    return false;
  }
  console.log(`Downloading ImageMagick 7 → ${VENDORED_MAGICK}`);
  await Deno.mkdir(TOOLS_DIR, { recursive: true });
  const res = await fetch(MAGICK_URL);
  if (!res.ok || !res.body) {
    console.warn(
      `Failed to download magick (${res.status}). ` +
        `Tile rendering will be broken until you install ImageMagick 7.`,
    );
    return false;
  }
  const file = await Deno.open(VENDORED_MAGICK, {
    write: true,
    create: true,
    truncate: true,
    mode: 0o755,
  });
  await res.body.pipeTo(file.writable);
  await Deno.chmod(VENDORED_MAGICK, 0o755);
  return true;
}

// 1. npm install drops .package-lock.json into node_modules on success.
const installed = await fileExists(
  `${ROOT}client/node_modules/.package-lock.json`,
);
if (!installed) await runTask("install");

// 2. ImageMagick 7 — server's /api/tile and build_tiles.ts both need `magick`.
if (!(await magickAvailable())) {
  await downloadMagick();
}

// 3. Tile masters — server resizes from these on demand. Only rebuild when
//    missing so we don't re-run minutes of ImageMagick work every launch.
if (await magickAvailable()) {
  if (!(await dirHasFiles(MASTERS_DIR))) {
    await runTask("build-tiles");
  }
}

// 4. Hand off to the dev/serve flow with our vendor dir on PATH.
await runTask("start");
