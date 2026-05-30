<script setup lang="ts">
//license GPL Jonas Immanuel Frey
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import * as THREE from "three";
import ControlsPanel from "./components/ControlsPanel.vue";
import DepthCanvas from "./components/DepthCanvas.vue";
import MeshPreview from "./components/MeshPreview.vue";
import StatsBar from "./components/StatsBar.vue";
import StripPreview from "./components/StripPreview.vue";
import DownloadButton from "./components/DownloadButton.vue";
import DonateButton from "./components/DonateButton.vue";
import DonateModal from "./components/DonateModal.vue";
import { buildDepthMap, TEXT_SUPERSAMPLE } from "./composables/useDepthMap";
import { buildMesh } from "./composables/useMeshBuilder";
import { exportSTL } from "./composables/useSTLExport";
import { useFontLoader } from "./composables/useFontLoader";
import { useTileLibrary } from "./composables/useTileLibrary";
import {
  fetchServerTextImage,
  isServerFont,
  serverFontFamily,
  useServerFonts,
} from "./composables/useServerFonts";
import { GLDepthRenderer } from "./composables/useGLDepthRenderer";
import { STRIP_SUPERSAMPLE, summarizePlan } from "./composables/useFrame";
import {
  applyLayout,
  deriveLayout,
  deriveLayoutForImage,
  measureTextMm,
} from "./composables/useLayout";
import {
  FONT_OPTIONS,
  type FontDisplayOption,
  type FramePlanSummary,
  type MeshStats,
  type PlateConfig,
} from "./types";


const config = reactive<PlateConfig>({
  text: "adsf",
  fontFamily: '"Times New Roman", serif',
  fontSizeMm: 14,
  // Plate + frame dims are auto-derived from the rendered text in rebuildAll;
  // these defaults are only placeholders before the first measurement.
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
});

const depthCanvas = shallowRef<HTMLCanvasElement | null>(null);
const stripCanvas = shallowRef<HTMLCanvasElement | null>(null);
const geometry = shallowRef<THREE.BufferGeometry | null>(null);
const stats = ref<MeshStats | null>(null);
const framePlanSummary = ref<FramePlanSummary | null>(null);
const building = ref(false);

const { preloadAll, ensureLoaded } = useFontLoader();
const { manifest, loadManifest, loadTileImage } = useTileLibrary();
const { state: serverFonts, loadServerFonts } = useServerFonts();

const fontOptions = computed<FontDisplayOption[]>(() => {
  const dynamic: FontDisplayOption[] = serverFonts.fonts.map((f) => ({
    family: serverFontFamily(f.id),
    label: f.label,
    google: null,
    serverRendered: true,
  }));
  return [...dynamic, ...FONT_OPTIONS];
});

let renderer: GLDepthRenderer | null = null;
let meshTimer: number | null = null;

async function getTileImage(): Promise<{ image: HTMLImageElement; id: string } | null> {
  if (config.frame.shape === "none") return null;
  let id = config.frame.tileId;
  if (!id && manifest.value.length > 0) {
    id = manifest.value[0].id;
    config.frame.tileId = id;
  }
  if (!id) return null;
  // One tile period spans tileScaleMm of the strip, which we sample at up to
  // vertexDensity × STRIP_SUPERSAMPLE pixels/mm — match the master resolution
  // to that so neither the GL composite nor the CPU strip preview undersamples.
  const requiredWidthPx = Math.ceil(
    Math.max(1, config.frame.tileScaleMm) * config.vertexDensity * STRIP_SUPERSAMPLE,
  );
  try {
    const image = await loadTileImage(id, requiredWidthPx);
    return { image, id };
  } catch (e) {
    console.warn("tile load failed", e);
    return null;
  }
}

async function rebuildDepth() {
  if (!renderer) return null;
  const tileFactor = config.frame.tileScaleFactor;
  const decoFactor = config.frame.decorationSizeFactor;
  const useServerFont = !config.customImage && isServerFont(config.fontFamily);

  let serverTextImage: HTMLImageElement | null = null;
  // Plate + frame dims are derived from the rendered text (or custom image
  // aspect) so the user only has to think about text size in mm.
  let layout;
  if (config.customImage) {
    layout = deriveLayoutForImage(
      config.customImage,
      config.fontSizeMm,
      config.frame.shape,
      tileFactor,
      decoFactor,
      config.textPaddingMm,
      config.outerPaddingMm,
    );
  } else if (useServerFont) {
    const pxPerMm = config.vertexDensity * TEXT_SUPERSAMPLE;
    const fontPx = Math.max(8, Math.round(config.fontSizeMm * pxPerMm));
    const text = config.text.length > 0 ? config.text : " ";
    try {
      serverTextImage = await fetchServerTextImage(config.fontFamily, text, fontPx);
    } catch (e) {
      console.warn("server text render failed", e);
      serverTextImage = null;
    }
    const widthMm = serverTextImage ? serverTextImage.naturalWidth / pxPerMm : 1;
    const heightMm = serverTextImage ? serverTextImage.naturalHeight / pxPerMm : 1;
    layout = deriveLayout(
      widthMm,
      heightMm,
      config.frame.shape,
      tileFactor,
      decoFactor,
      config.textPaddingMm,
      config.outerPaddingMm,
    );
  } else {
    const fontPx = config.fontSizeMm * config.vertexDensity * TEXT_SUPERSAMPLE;
    await ensureLoaded(config.fontFamily, fontPx);
    const m = measureTextMm(config.text, config.fontFamily, config.fontSizeMm);
    layout = deriveLayout(
      m.widthMm,
      m.heightMm,
      config.frame.shape,
      tileFactor,
      decoFactor,
      config.textPaddingMm,
      config.outerPaddingMm,
    );
  }
  applyLayout(config, layout);
  const tile = await getTileImage();
  const map = buildDepthMap(config, tile?.image ?? null, tile?.id ?? null, renderer, serverTextImage);
  depthCanvas.value = map.canvas;
  stripCanvas.value = map.stripCanvas;
  framePlanSummary.value = map.framePlan ? summarizePlan(map.framePlan) : null;
  return map;
}

async function rebuildAll() {
  building.value = true;
  try {
    const map = await rebuildDepth();
    if (!map) return;
    const { geometry: g, stats: s } = buildMesh(config, map);
    const prev = geometry.value;
    geometry.value = g;
    stats.value = s;
    if (prev) prev.dispose();
  } finally {
    building.value = false;
  }
}

function scheduleRebuild() {
  if (meshTimer != null) window.clearTimeout(meshTimer);
  meshTimer = window.setTimeout(() => {
    meshTimer = null;
    void rebuildAll();
  }, 150);
}

watch(
  () => ({
    text: config.text,
    fontFamily: config.fontFamily,
    fontSizeMm: config.fontSizeMm,
    baseThicknessMm: config.baseThicknessMm,
    embossHeightMm: config.embossHeightMm,
    cornerRadiusMm: config.cornerRadiusMm,
    textPaddingMm: config.textPaddingMm,
    outerPaddingMm: config.outerPaddingMm,
    vertexDensity: config.vertexDensity,
    customImage: config.customImage,
    frameShape: config.frame.shape,
    frameTile: config.frame.tileId,
    tileScaleFactor: config.frame.tileScaleFactor,
    decorationSizeFactor: config.frame.decorationSizeFactor,
  }),
  () => {
    scheduleRebuild();
  },
);

function onUpdate(v: PlateConfig) {
  Object.assign(config, v);
  Object.assign(config.frame, v.frame);
}

function clearImage() {
  config.customImage = null;
}

const DONATE_PROMPT_KEY = "ll.hideDonatePrompt";
const donateModalOpen = ref(false);

function doDownload() {
  if (!geometry.value) return;
  const name = config.customImage ? "nameplate" : config.text;
  exportSTL(geometry.value, name);
}

function onDownload() {
  if (!geometry.value) return;
  const hidden = (() => {
    try {
      return localStorage.getItem(DONATE_PROMPT_KEY) === "1";
    } catch {
      return false;
    }
  })();
  if (hidden) {
    doDownload();
    return;
  }
  donateModalOpen.value = true;
}

function onDonateConfirm(dontShowAgain: boolean) {
  donateModalOpen.value = false;
  if (dontShowAgain) {
    try {
      localStorage.setItem(DONATE_PROMPT_KEY, "1");
    } catch {
      // localStorage unavailable (private mode etc.) — just skip persistence
    }
  }
  doDownload();
}

function onDonateCancel() {
  donateModalOpen.value = false;
}

const showStrip = computed(() => config.frame.shape !== "none" && !!stripCanvas.value);

onMounted(async () => {
  renderer = new GLDepthRenderer();
  await Promise.all([preloadAll(), loadManifest(), loadServerFonts()]);
  await rebuildAll();
});

onBeforeUnmount(() => {
  if (meshTimer != null) window.clearTimeout(meshTimer);
  renderer?.dispose();
  renderer = null;
});
</script>

<template>
  <div class="app">
    <ControlsPanel
      :model-value="config"
      :tiles="manifest"
      :frame-plan="framePlanSummary"
      :font-options="fontOptions"
      @update:model-value="onUpdate"
      @clear-image="clearImage"
    />
    <main class="workspace">
      <header class="top-bar">
        <h1>Lovely Labels</h1>
        <span class="sub">3D Name Plate → STL</span>
        <DonateButton />
        <DownloadButton :disabled="!geometry || building" @download="onDownload" />
      </header>
      <DonateModal
        :open="donateModalOpen"
        @confirm="onDonateConfirm"
        @cancel="onDonateCancel"
      />
      <div class="previews" :class="{ 'with-strip': showStrip }">
        <DepthCanvas :source="depthCanvas" />
        <StripPreview v-if="showStrip" :source="stripCanvas" />
        <MeshPreview :geometry="geometry" :config="config" />
      </div>
      <StatsBar :stats="stats" :building="building" />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: 100%;
}
.workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.top-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #1a1d27;
  border-bottom: 1px solid #2a2f3d;
}
h1 {
  font-size: 1.05rem;
  margin: 0;
  letter-spacing: 0.02em;
}
.sub {
  color: #8b94aa;
  font-size: 0.8rem;
  margin-right: auto;
}
.previews {
  flex: 1;
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(0, 2fr);
  gap: 0.75rem;
  padding: 0.75rem;
  min-height: 0;
}
.previews.with-strip {
  grid-template-rows: minmax(0, 1fr) minmax(0, 0.4fr) minmax(0, 2fr);
}
@media (min-width: 1400px) {
  .previews {
    grid-template-rows: none;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  }
  .previews.with-strip {
    grid-template-rows: minmax(0, 1fr) minmax(0, 0.5fr);
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  }
  .previews.with-strip > :nth-child(1) { grid-column: 1; grid-row: 1; }
  .previews.with-strip > :nth-child(2) { grid-column: 1; grid-row: 2; }
  .previews.with-strip > :nth-child(3) { grid-column: 2; grid-row: 1 / span 2; }
}
</style>
