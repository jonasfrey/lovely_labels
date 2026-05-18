<script setup lang="ts">
//license GPL Jonas Immanuel Frey
import { computed } from "vue";
import {
  type FontDisplayOption,
  type FrameConfig,
  type FrameShape,
  type FramePlanSummary,
  type PlateConfig,
  type TileManifestEntry,
} from "../types";
import FontPicker from "./FontPicker.vue";

const props = defineProps<{
  modelValue: PlateConfig;
  tiles: TileManifestEntry[];
  framePlan: FramePlanSummary | null;
  fontOptions: FontDisplayOption[];
}>();
const emit = defineEmits<{
  (e: "update:modelValue", v: PlateConfig): void;
  (e: "clearImage"): void;
}>();

function patch<K extends keyof PlateConfig>(key: K, value: PlateConfig[K]) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}

function patchFrame<K extends keyof FrameConfig>(key: K, value: FrameConfig[K]) {
  emit("update:modelValue", {
    ...props.modelValue,
    frame: { ...props.modelValue.frame, [key]: value },
  });
}

function onFile(ev: Event) {
  const target = ev.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => patch("customImage", img);
  img.src = URL.createObjectURL(file);
}

const hasImage = computed(() => !!props.modelValue.customImage);
const frame = computed(() => props.modelValue.frame);
const showFrameDetails = computed(() => frame.value.shape !== "none");

const plateDims = computed(
  () => `${props.modelValue.widthMm.toFixed(1)} × ${props.modelValue.heightMm.toFixed(1)} mm`,
);

const layoutDetails = computed<Array<{ k: string; v: string }>>(() => {
  const items: Array<{ k: string; v: string }> = [
    { k: "Plate", v: plateDims.value },
  ];
  const p = props.framePlan;
  if (p) {
    items.push({ k: "Ring thickness", v: `${p.ringThicknessMm.toFixed(2)} mm` });
    items.push({ k: "Tile scale", v: `${p.tileScaleMm.toFixed(2)} mm` });
    items.push({ k: "Perimeter", v: `${p.perimeterMm.toFixed(2)} mm (${p.tileRepetitions}×)` });
    if (p.shape === "ring" && p.ringOuterDiameterMm != null) {
      items.push({ k: "Ring outer Ø", v: `${p.ringOuterDiameterMm.toFixed(2)} mm` });
    }
    if (p.shape === "roundedRect" && p.rectCornerRadiusMm != null) {
      items.push({ k: "Corner radius", v: `${p.rectCornerRadiusMm.toFixed(2)} mm` });
    }
  }
  return items;
});

const shapeOptions: Array<{ value: FrameShape; label: string }> = [
  { value: "none", label: "None" },
  { value: "ring", label: "Ring" },
  { value: "roundedRect", label: "Rounded rectangle" },
];
</script>

<template>
  <aside class="controls">
    <section>
      <h3>Text</h3>
      <label>
        Text
        <textarea
          rows="2"
          :value="modelValue.text"
          @input="patch('text', ($event.target as HTMLTextAreaElement).value)"
          :disabled="hasImage"
        ></textarea>
      </label>
      <label>
        Font family
        <FontPicker
          :model-value="modelValue.fontFamily"
          :options="fontOptions"
          :disabled="hasImage"
          @update:model-value="patch('fontFamily', $event)"
        />
      </label>
      <label>
        Text size (mm): {{ modelValue.fontSizeMm }}
        <input
          type="range"
          min="1"
          max="100"
          step="0.5"
          :value="modelValue.fontSizeMm"
          @input="patch('fontSizeMm', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </section>

    <section>
      <h3>Frame</h3>
      <div class="shape-row">
        <label
          v-for="opt in shapeOptions"
          :key="opt.value"
          class="radio"
        >
          <input
            type="radio"
            name="frame-shape"
            :value="opt.value"
            :checked="frame.shape === opt.value"
            @change="patchFrame('shape', opt.value)"
          />
          {{ opt.label }}
        </label>
      </div>

      <label>
        Text padding (mm): {{ modelValue.textPaddingMm.toFixed(1) }}
        <input
          type="range"
          min="-10"
          max="15"
          step="0.1"
          :value="modelValue.textPaddingMm"
          @input="patch('textPaddingMm', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label v-if="showFrameDetails">
        Outer padding (mm): {{ modelValue.outerPaddingMm.toFixed(1) }}
        <input
          type="range"
          min="0"
          max="15"
          step="0.1"
          :value="modelValue.outerPaddingMm"
          @input="patch('outerPaddingMm', Number(($event.target as HTMLInputElement).value))"
        />
      </label>

      <template v-if="showFrameDetails">
        <label>
          Decoration size: {{ frame.decorationSizeFactor.toFixed(2) }}×
          <input
            type="range"
            min="0.3"
            max="3"
            step="0.05"
            :value="frame.decorationSizeFactor"
            @input="patchFrame('decorationSizeFactor', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <label>
          Tile width: {{ frame.tileScaleFactor.toFixed(2) }}×
          <input
            type="range"
            min="0.3"
            max="3"
            step="0.05"
            :value="frame.tileScaleFactor"
            @input="patchFrame('tileScaleFactor', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <div class="tile-grid" v-if="tiles.length > 0">
          <button
            v-for="t in tiles"
            :key="t.id"
            type="button"
            class="tile"
            :class="{ selected: t.id === frame.tileId }"
            :title="t.id"
            @click="patchFrame('tileId', t.id)"
          >
            <img :src="`/tiles/${t.thumb}`" :alt="t.id" loading="lazy" />
          </button>
        </div>
        <div v-else class="hint">No tiles found — run <code>deno task build-tiles</code></div>
      </template>
    </section>

    <section>
      <h3>Layout (auto)</h3>
      <dl class="info">
        <template v-for="item in layoutDetails" :key="item.k">
          <dt>{{ item.k }}</dt>
          <dd>{{ item.v }}</dd>
        </template>
      </dl>
    </section>

    <section>
      <h3>Print</h3>
      <label>
        Base thickness (mm)
        <input type="number" min="0.4" step="0.1"
          :value="modelValue.baseThicknessMm"
          @input="patch('baseThicknessMm', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label>
        Emboss height (mm)
        <input type="number" min="0" step="0.1"
          :value="modelValue.embossHeightMm"
          @input="patch('embossHeightMm', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label>
        Corner radius (mm): {{ modelValue.cornerRadiusMm.toFixed(1) }}
        <input type="range" min="0" max="20" step="0.5"
          :value="modelValue.cornerRadiusMm"
          @input="patch('cornerRadiusMm', Number(($event.target as HTMLInputElement).value))" />
      </label>
    </section>

    <section>
      <h3>Mesh</h3>
      <label>
        Vertex density (verts/mm): {{ modelValue.vertexDensity }}
        <input type="range" min="1" max="20" step="1"
          :value="modelValue.vertexDensity"
          @input="patch('vertexDensity', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label class="file">
        Custom depth map (PNG/JPG)
        <input type="file" accept="image/png,image/jpeg" @change="onFile" />
      </label>
      <button v-if="hasImage" type="button" class="ghost" @click="emit('clearImage')">
        Remove uploaded image
      </button>
    </section>

    <section>
      <h3>Debug</h3>
      <label class="checkbox">
        <input type="checkbox"
          :checked="modelValue.showVertices"
          @change="patch('showVertices', ($event.target as HTMLInputElement).checked)" />
        Show mesh vertices
      </label>
      <label class="checkbox">
        <input type="checkbox"
          :checked="modelValue.showReferenceObject"
          @change="patch('showReferenceObject', ($event.target as HTMLInputElement).checked)" />
        Show reference object (180 mm banana)
      </label>
    </section>
  </aside>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1rem;
  background: #1a1d27;
  border-right: 1px solid #2a2f3d;
  overflow-y: auto;
}
section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
h3 {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9aa3b8;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #cbd2e0;
}
label.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}
label.radio {
  flex-direction: row;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
}
.shape-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
}
label.file input {
  font-size: 0.78rem;
}
input[type="text"],
input[type="number"],
textarea,
select {
  background: #11131a;
  border: 1px solid #2c3142;
  color: #eaedf5;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  font-size: 0.9rem;
  font-family: inherit;
}
textarea {
  resize: vertical;
  min-height: 2.4rem;
  line-height: 1.25;
}
input:disabled,
textarea:disabled,
select:disabled {
  opacity: 0.45;
}
button.ghost {
  background: transparent;
  border: 1px solid #3a4054;
  color: #cbd2e0;
  padding: 0.35rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}
button.ghost:hover { background: #2a2f3d; }
.tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(54px, 1fr));
  grid-auto-rows: min-content;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
  background: #11131a;
  border: 1px solid #2c3142;
  border-radius: 4px;
}
.tile {
  position: relative;
  display: block;
  width: 100%;
  height: 0;
  padding-top: 100%;
  background: #000;
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: pointer;
  overflow: hidden;
}
.tile img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tile.selected {
  border-color: #6f8cff;
  box-shadow: 0 0 0 1px #6f8cff inset;
}
.tile:hover { border-color: #4a5470; }
.hint {
  font-size: 0.72rem;
  color: #8b94aa;
}
.hint code {
  background: #11131a;
  padding: 0 4px;
  border-radius: 3px;
}
.info {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 0.75rem;
  margin: 0;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
.info dt {
  color: #8b94aa;
}
.info dd {
  margin: 0;
  color: #cbd2e0;
}
</style>
