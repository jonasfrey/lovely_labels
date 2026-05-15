# Lovely Labels

Browser-side generator for 3D-printable name plates. Rasterizes text (or an uploaded image) into a greyscale depth map, displaces a mesh from it, optionally wraps a decorative tile-based frame around it, and exports binary STL.

## Stack
- **Server:** Deno static file host (`server.ts`). No DB, no auth.
- **Client:** Vue 3 (`<script setup>`) + Vite + three.js.
- Depth-map compositing runs in a small WebGL2 fragment shader (`useGLDepthRenderer.ts`); mesh + STL export are pure JS.

## Run

```bash
deno task install        # one-time: cd client && npm install
deno task dev            # vite dev server (recommended while iterating)
deno task build          # vue-tsc + vite build → client/dist
deno task serve          # serve client/dist + /api/* via server.ts
deno task start          # build + serve
```

While iterating, run `deno task serve` in one terminal and `deno task dev` in another — Vite proxies `/api/*` to `localhost:8080`, so the server-font endpoints are reachable from the dev frontend.

## Server-rendered fonts

Drop `.ttf` or `.otf` files anywhere under `fonts/` (subdirectories OK). The server scans the tree on first request and exposes each file as a dropdown entry; the client renders text by fetching `GET /api/text?text=…&font=<id>&fontPx=…`, which shells out to ImageMagick. Font files are gitignored and never bundled into `client/dist`, so licensed fonts stay on the server.

## Tile assets

The decorative frame samples horizontally-seamless greyscale tiles from `client/public/tiles/`, listed in `client/public/tiles/manifest.json`. Drop source `.tif` files into `horizontal_tiles/` and run:

```bash
deno task build-tiles    # requires `magick` (ImageMagick) on PATH
```

This regenerates the PNG copies, 128 px thumbnails, and the manifest.

> **Recovered note:** the current `client/public/tiles/` contents are 128 px placeholders bootstrapped from a saved-page snapshot. Restore the original `horizontal_tiles/*.tif` source artwork and re-run `deno task build-tiles` to get full-resolution 1024 px tiles back.

## Reference object

The 3D preview can show a 180 mm banana as a scale reference (toggle in the Debug section). Drop a CC0 low-poly banana at `client/public/reference/banana.glb` for the real model; otherwise the renderer falls back to a procedural curved-tube stand-in.

## Layout

```
client/
  index.html
  vite.config.ts
  tsconfig*.json
  package.json
  public/
    tiles/              # manifest.json + tile PNGs (build output)
    reference/          # optional banana.glb
  src/
    main.ts
    App.vue
    types.ts
    components/         # UI panels
    composables/        # depth-map / mesh / WebGL / layout / STL helpers
deno.json
server.ts
scripts/build_tiles.ts
horizontal_tiles/       # source .tif tiles (gitignored output goes to client/public/tiles)
```
