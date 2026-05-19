<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import * as THREE from "three";
import { createPreview, type ThreePreview } from "../composables/useThreePreview";
import { KEY_YALE_STYLE, loadReferenceObject, disposeReference } from "../composables/useReferenceObjects";
import type { PlateConfig } from "../types";

const props = defineProps<{
  geometry: THREE.BufferGeometry | null;
  config: PlateConfig;
}>();

const container = ref<HTMLDivElement | null>(null);
const preview = shallowRef<ThreePreview | null>(null);

let plateMesh: THREE.Mesh | null = null;
let vertexHelper: THREE.Points | null = null;
let referenceObj: THREE.Group | null = null;
let resizeObserver: ResizeObserver | null = null;

const PLATE_MAT = new THREE.MeshStandardMaterial({
  color: 0xd6dbe8,
  roughness: 0.55,
  metalness: 0.05,
  side: THREE.DoubleSide,
  flatShading: false,
});

const VERTEX_MAT = new THREE.PointsMaterial({
  color: 0x6f8cff,
  size: 1.2,
  sizeAttenuation: false,
});

const REFERENCE_GAP_MM = 5;

function centerPlate(geom: THREE.BufferGeometry, cfg: PlateConfig): THREE.BufferGeometry {
  // Mesh builder positions verts in [0, W] × [0, H] × [0, ...]. Re-center on XY
  // so the plate sits at the world origin and the ground plane / orbit controls
  // behave naturally.
  const g = geom.clone();
  g.translate(-cfg.widthMm * 0.5, -cfg.heightMm * 0.5, 0);
  return g;
}

function positionReference(): void {
  if (!referenceObj) return;
  const cfg = props.config;
  // Place along the plate's long axis with a small gap, both objects sitting on
  // the same ground plane (z=0).
  const longAxisIsX = cfg.widthMm >= cfg.heightMm;
  const refBox = new THREE.Box3().setFromObject(referenceObj);
  const refSize = new THREE.Vector3();
  refBox.getSize(refSize);
  referenceObj.position.set(0, 0, 0);
  if (longAxisIsX) {
    referenceObj.position.x = cfg.widthMm * 0.5 + REFERENCE_GAP_MM + refSize.x * 0.5;
    referenceObj.rotation.z = 0;
  } else {
    referenceObj.position.y = cfg.heightMm * 0.5 + REFERENCE_GAP_MM + refSize.x * 0.5;
    referenceObj.rotation.z = Math.PI / 2;
  }
}

function syncPlate(): void {
  const p = preview.value;
  if (!p) return;
  if (plateMesh) {
    p.scene.remove(plateMesh);
    plateMesh.geometry.dispose();
    plateMesh = null;
  }
  if (vertexHelper) {
    p.scene.remove(vertexHelper);
    vertexHelper.geometry.dispose();
    vertexHelper = null;
  }
  if (!props.geometry) return;
  const g = centerPlate(props.geometry, props.config);
  plateMesh = new THREE.Mesh(g, PLATE_MAT);
  p.scene.add(plateMesh);
  if (props.config.showVertices) {
    vertexHelper = new THREE.Points(g, VERTEX_MAT);
    p.scene.add(vertexHelper);
  }
  positionReference();
  const box = new THREE.Box3().setFromObject(plateMesh);
  if (referenceObj) box.expandByObject(referenceObj);
  p.fitToBox(box, 1.5);
}

async function syncReference(): Promise<void> {
  const p = preview.value;
  if (!p) return;
  if (props.config.showReferenceObject && !referenceObj) {
    referenceObj = await loadReferenceObject(KEY_YALE_STYLE);
    if (!props.config.showReferenceObject) {
      // Toggled off while loading.
      disposeReference(referenceObj);
      referenceObj = null;
      return;
    }
    p.scene.add(referenceObj);
    positionReference();
  } else if (!props.config.showReferenceObject && referenceObj) {
    p.scene.remove(referenceObj);
    disposeReference(referenceObj);
    referenceObj = null;
  }
}

onMounted(async () => {
  if (!container.value) return;
  const p = createPreview(container.value);
  preview.value = p;
  p.resize(container.value.clientWidth, container.value.clientHeight);
  p.start();

  resizeObserver = new ResizeObserver(() => {
    if (!container.value) return;
    p.resize(container.value.clientWidth, container.value.clientHeight);
  });
  resizeObserver.observe(container.value);

  await syncReference();
  syncPlate();
});

watch(
  () => props.geometry,
  () => syncPlate(),
);

watch(
  () => props.config.showReferenceObject,
  async () => {
    await syncReference();
    syncPlate();
  },
);

watch(
  () => props.config.showVertices,
  () => syncPlate(),
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (referenceObj && preview.value) {
    preview.value.scene.remove(referenceObj);
    disposeReference(referenceObj);
    referenceObj = null;
  }
  if (plateMesh && preview.value) {
    preview.value.scene.remove(plateMesh);
    plateMesh.geometry.dispose();
    plateMesh = null;
  }
  if (vertexHelper && preview.value) {
    preview.value.scene.remove(vertexHelper);
    vertexHelper.geometry.dispose();
    vertexHelper = null;
  }
  preview.value?.dispose();
  preview.value = null;
});
</script>

<template>
  <section class="panel">
    <header>3D mesh preview (key size reference)</header>
    <div class="stage" ref="container"></div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  background: #11131a;
  border: 1px solid #2a2f3d;
  border-radius: 6px;
  min-height: 0;
  min-width: 0;
}
header {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8b94aa;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #2a2f3d;
}
.stage {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
}
.stage :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
</style>
