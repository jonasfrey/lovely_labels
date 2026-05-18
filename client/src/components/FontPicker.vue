<script setup lang="ts">
//license GPL Jonas Immanuel Frey
// Visual font picker. For each available font option we render a small
// preview where the font's own label is drawn in that font:
//   * CSS / Google-hosted fonts → a styled <span>, sized to a fixed pixel height
//   * server-rendered fonts     → a PNG fetched from /api/text?font=…&text=label
import { computed } from "vue";
import { type FontDisplayOption } from "../types";
import { serverFontId } from "../composables/useServerFonts";

const props = defineProps<{
  modelValue: string;
  options: FontDisplayOption[];
  disabled?: boolean;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();

// Pixel height matching the on-disk thumbnail style. Kept small so the
// dropdown stays compact even with many fonts.
const PREVIEW_PX = 28;

interface PickerEntry {
  family: string;
  label: string;
  weight: number;
  serverPreviewUrl: string | null;
}

const entries = computed<PickerEntry[]>(() =>
  props.options.map((o) => {
    const weight = (o as { weight?: number }).weight ?? 400;
    const id = o.serverRendered ? serverFontId(o.family) : null;
    let serverPreviewUrl: string | null = null;
    if (id) {
      const params = new URLSearchParams({
        text: o.label,
        font: id,
        fontPx: String(PREVIEW_PX),
      });
      serverPreviewUrl = `/api/text?${params.toString()}`;
    }
    return { family: o.family, label: o.label, weight, serverPreviewUrl };
  })
);

function select(family: string): void {
  if (props.disabled) return;
  emit("update:modelValue", family);
}
</script>

<template>
  <div class="font-picker" :class="{ disabled }" role="listbox">
    <button
      v-for="e in entries"
      :key="`${e.family}|${e.label}`"
      type="button"
      class="row"
      :class="{ selected: e.family === modelValue }"
      :disabled="disabled"
      role="option"
      :aria-selected="e.family === modelValue"
      :title="e.label"
      @click="select(e.family)"
    >
      <img
        v-if="e.serverPreviewUrl"
        class="preview"
        :src="e.serverPreviewUrl"
        :alt="e.label"
        loading="lazy"
      />
      <span
        v-else
        class="preview text"
        :style="{ fontFamily: e.family, fontWeight: e.weight }"
      >{{ e.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.font-picker {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
  background: #11131a;
  border: 1px solid #2c3142;
  border-radius: 4px;
}
.font-picker.disabled {
  opacity: 0.45;
  pointer-events: none;
}
.row {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 2px 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  color: #eaedf5;
  cursor: pointer;
  text-align: left;
}
.row:hover {
  border-color: #4a5470;
}
.row.selected {
  border-color: #6f8cff;
  box-shadow: 0 0 0 1px #6f8cff inset;
}
.preview {
  display: block;
  max-height: 28px;
  width: auto;
}
.preview.text {
  font-size: 22px;
  line-height: 28px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview:not(.text) {
  /* Server PNGs are white-on-black; render them as-is on the dark panel. */
  image-rendering: auto;
}
</style>
