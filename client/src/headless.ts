//license GPL Jonas Immanuel Frey
// Headless STL generation harness. Reuses the exact same depth-map → mesh →
// STL pipeline the app uses, but driven from a plain page so a headless browser
// (see scripts/generate_all_stl.mjs) can batch-produce STL files server-side.
import * as THREE from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import type { PlateConfig } from "./types";
import { buildDepthMap, TEXT_SUPERSAMPLE } from "./composables/useDepthMap";
import { buildMesh } from "./composables/useMeshBuilder";
import { GLDepthRenderer } from "./composables/useGLDepthRenderer";
import { STRIP_SUPERSAMPLE } from "./composables/useFrame";
import { applyLayout, deriveLayout, measureTextMm } from "./composables/useLayout";
import { loadTileImage, useTileLibrary } from "./composables/useTileLibrary";

function defaultConfig(): PlateConfig {
  // Mirror the App.vue defaults so headless output matches the interactive app.
  return {
    text: "test",
    fontFamily: '"Times New Roman", serif',
    fontSizeMm: 14,
    widthMm: 80,
    heightMm: 30,
    baseThicknessMm: 4,
    embossHeightMm: 1.2,
    cornerRadiusMm: 4,
    textPaddingMm: -1,
    outerPaddingMm: 1,
    vertexDensity: 15,
    customImage: null,
    showVertices: false,
    showReferenceObject: true,
    frame: {
      shape: "roundedRect",
      tileId: null,
      ringOuterDiameterMm: 70,
      rectOuterWidthMm: 80,
      rectOuterHeightMm: 30,
      rectCornerRadiusMm: 6,
      rectSnapDimension: "tileScale",
      ringThicknessMm: 6,
      tileScaleMm: 25,
      tileScaleFactor: 1,
      decorationSizeFactor: 1,
    },
  };
}

// Binary STL bytes for the given geometry, matching useSTLExport's orientation.
function geometryToStl(geometry: THREE.BufferGeometry): Uint8Array {
  const exporter = new STLExporter();
  const rotated = geometry.clone();
  rotated.rotateX(Math.PI / 2);
  rotated.rotateZ(Math.PI / 2);
  const mesh = new THREE.Mesh(rotated);
  const data = exporter.parse(mesh, { binary: true }) as unknown as DataView;
  const bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  rotated.dispose();
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

let renderer: GLDepthRenderer | null = null;

async function generateForTile(text: string, tileId: string): Promise<string> {
  if (!renderer) renderer = new GLDepthRenderer();
  const config = defaultConfig();
  config.text = text;
  config.frame.tileId = tileId;

  // Replicate App.vue rebuildDepth() for the system-font (non-server, non-image)
  // path: measure text → derive plate/frame dims → load tile → composite → mesh.
  const m = measureTextMm(config.text, config.fontFamily, config.fontSizeMm);
  const layout = deriveLayout(
    m.widthMm,
    m.heightMm,
    config.frame.shape,
    config.frame.tileScaleFactor,
    config.frame.decorationSizeFactor,
    config.textPaddingMm,
    config.outerPaddingMm,
  );
  applyLayout(config, layout);

  const requiredWidthPx = Math.ceil(
    Math.max(1, config.frame.tileScaleMm) * config.vertexDensity * STRIP_SUPERSAMPLE,
  );
  const image = await loadTileImage(tileId, requiredWidthPx);
  const map = buildDepthMap(config, image, tileId, renderer, null);
  const { geometry } = buildMesh(config, map);
  const stl = geometryToStl(geometry);
  geometry.dispose();
  return bytesToBase64(stl);
}

declare global {
  interface Window {
    llReady: Promise<string[]>;
    llTileIds: () => string[];
    llGenerate: (text: string, tileId: string) => Promise<string>;
  }
}

const { manifest, loadManifest } = useTileLibrary();

// Resolve once the tile manifest is loaded; the driver awaits this before asking
// for tile ids so it never races the fetch.
window.llReady = loadManifest().then(() => manifest.value.map((t) => t.id));
window.llTileIds = () => manifest.value.map((t) => t.id);
window.llGenerate = generateForTile;
