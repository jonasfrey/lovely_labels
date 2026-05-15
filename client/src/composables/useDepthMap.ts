import type { PlateConfig } from "../types";
import { planFrame, buildStripCanvas, type FramePlan } from "./useFrame";
import type { GLDepthRenderer } from "./useGLDepthRenderer";
import { LINE_HEIGHT_FACTOR } from "./useLayout";
import { getTileContentRange } from "./useTileLibrary";

export interface DepthMap {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  stripCanvas: HTMLCanvasElement | null;
  framePlan: FramePlan | null;
}

export const TEXT_SUPERSAMPLE = 2;

function gridSize(cfg: PlateConfig): { nx: number; ny: number } {
  const nx = Math.max(1, Math.round(cfg.widthMm * cfg.vertexDensity)) + 1;
  const ny = Math.max(1, Math.round(cfg.heightMm * cfg.vertexDensity)) + 1;
  return { nx, ny };
}

interface TextBox {
  maxWidthPx: number;
  maxHeightPx: number;
}

function textBoxFor(plan: FramePlan | null, plateWmm: number, plateHmm: number, pxPerMm: number): TextBox {
  if (!plan) {
    return { maxWidthPx: plateWmm * pxPerMm * 0.95, maxHeightPx: plateHmm * pxPerMm * 0.95 };
  }
  if (plan.shape === "ring") {
    const cx = plateWmm * 0.5;
    const cy = plateHmm * 0.5;
    const innerR = Math.max(0, plan.centerlineRadiusMm - plan.ringThicknessMm * 0.5);
    const clampedR = Math.min(innerR, cx, cy);
    const side = Math.SQRT2 * clampedR * 0.9;
    return { maxWidthPx: side * pxPerMm, maxHeightPx: side * pxPerMm };
  }
  const innerWmm = Math.max(0, Math.min(plan.outerWidthMm, plateWmm) - 2 * plan.ringThicknessMm);
  const innerHmm = Math.max(0, Math.min(plan.outerHeightMm, plateHmm) - 2 * plan.ringThicknessMm);
  return { maxWidthPx: innerWmm * pxPerMm * 0.9, maxHeightPx: innerHmm * pxPerMm * 0.9 };
}

function drawText(
  ctx: CanvasRenderingContext2D,
  cfg: PlateConfig,
  w: number,
  h: number,
  pxPerMm: number,
  box: TextBox,
): void {
  if (!cfg.text) return;
  const lines = cfg.text.split("\n");
  let fontPx = cfg.fontSizeMm * pxPerMm;
  ctx.font = `${fontPx}px ${cfg.fontFamily}`;
  let maxWidthPx = 0;
  for (const raw of lines) {
    if (raw.length === 0) continue;
    maxWidthPx = Math.max(maxWidthPx, ctx.measureText(raw).width);
  }
  const blockHeightPx = fontPx * LINE_HEIGHT_FACTOR * lines.length;
  const widthRatio = maxWidthPx / Math.max(1, box.maxWidthPx);
  const heightRatio = blockHeightPx / Math.max(1, box.maxHeightPx);
  const shrink = Math.max(widthRatio, heightRatio);
  if (shrink > 1) fontPx = fontPx / shrink;

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${fontPx}px ${cfg.fontFamily}`;

  const lineHeight = fontPx * LINE_HEIGHT_FACTOR;
  const totalHeight = lineHeight * lines.length;
  const topY = h / 2 - totalHeight / 2;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length === 0) continue;
    const cy = topY + (i + 0.5) * lineHeight;
    ctx.fillText(lines[i], w / 2, cy);
  }
}

function drawImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number): void {
  const ar = img.width / img.height;
  const targetAr = w / h;
  let dw: number;
  let dh: number;
  if (ar > targetAr) {
    dw = w;
    dh = w / ar;
  } else {
    dh = h;
    dw = h * ar;
  }
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// Server-rendered text comes in already rasterised at the depth-map
// resolution, so we just blit it centred at its native size — no shrink-to-fit
// pass like drawText, since plate dims were derived from the same image.
function drawServerText(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
): void {
  const dw = img.naturalWidth;
  const dh = img.naturalHeight;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy);
}

interface TextRender {
  canvas: HTMLCanvasElement;
  version: number;
}

let textCanvasCache: HTMLCanvasElement | null = null;
let textVersionCounter = 0;

function maskRoundedCorners(
  ctx: CanvasRenderingContext2D,
  cfg: PlateConfig,
  textPxW: number,
  textPxH: number,
  pxPerMm: number,
): void {
  const r = Math.max(0, Math.min(cfg.cornerRadiusMm, Math.min(cfg.widthMm, cfg.heightMm) * 0.5));
  if (r <= 0) return;
  const rPx = r * pxPerMm;
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.rect(0, 0, textPxW, textPxH);
  ctx.moveTo(rPx, 0);
  ctx.lineTo(textPxW - rPx, 0);
  ctx.arcTo(textPxW, 0, textPxW, rPx, rPx);
  ctx.lineTo(textPxW, textPxH - rPx);
  ctx.arcTo(textPxW, textPxH, textPxW - rPx, textPxH, rPx);
  ctx.lineTo(rPx, textPxH);
  ctx.arcTo(0, textPxH, 0, textPxH - rPx, rPx);
  ctx.lineTo(0, rPx);
  ctx.arcTo(0, 0, rPx, 0, rPx);
  ctx.closePath();
  ctx.fill("evenodd");
  ctx.restore();
}

function renderTextCanvas(
  cfg: PlateConfig,
  plan: FramePlan | null,
  textPxW: number,
  textPxH: number,
  pxPerMm: number,
  serverTextImage: HTMLImageElement | null,
): TextRender {
  if (!textCanvasCache) textCanvasCache = document.createElement("canvas");
  const canvas = textCanvasCache;
  if (canvas.width !== textPxW) canvas.width = textPxW;
  if (canvas.height !== textPxH) canvas.height = textPxH;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("text canvas 2d context unavailable");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, textPxW, textPxH);

  if (cfg.customImage) {
    drawImage(ctx, cfg.customImage, textPxW, textPxH);
  } else if (serverTextImage) {
    drawServerText(ctx, serverTextImage, textPxW, textPxH);
  } else {
    const box = textBoxFor(plan, cfg.widthMm, cfg.heightMm, pxPerMm);
    drawText(ctx, cfg, textPxW, textPxH, pxPerMm, box);
  }

  maskRoundedCorners(ctx, cfg, textPxW, textPxH, pxPerMm);

  textVersionCounter += 1;
  return { canvas, version: textVersionCounter };
}

export function buildDepthMap(
  cfg: PlateConfig,
  tileImage: HTMLImageElement | null,
  tileKey: string | null,
  renderer: GLDepthRenderer,
  serverTextImage: HTMLImageElement | null = null,
): DepthMap {
  const { nx, ny } = gridSize(cfg);
  const plan = planFrame(cfg.frame);
  const usePlan = plan && tileImage ? plan : null;

  const textPxPerMm = cfg.vertexDensity * TEXT_SUPERSAMPLE;
  const textPxW = Math.max(1, Math.round(cfg.widthMm * textPxPerMm));
  const textPxH = Math.max(1, Math.round(cfg.heightMm * textPxPerMm));
  const text = renderTextCanvas(cfg, usePlan, textPxW, textPxH, textPxPerMm, serverTextImage);

  const contentRange = usePlan && tileImage && tileKey
    ? getTileContentRange(tileImage, tileKey)
    : null;

  const result = renderer.render({
    textCanvas: text.canvas,
    textVersion: text.version,
    tileImage: usePlan ? tileImage : null,
    tileKey: usePlan ? tileKey : null,
    tileVRange: contentRange ? [contentRange.vMin, contentRange.vMax] : [0, 1],
    plateWidthMm: cfg.widthMm,
    plateHeightMm: cfg.heightMm,
    framePlan: usePlan,
    nx,
    ny,
  });

  let stripCanvas: HTMLCanvasElement | null = null;
  if (usePlan && tileImage) {
    stripCanvas = buildStripCanvas(
      usePlan,
      tileImage,
      cfg.vertexDensity,
      contentRange?.srcY ?? 0,
      contentRange?.srcH ?? 0,
    ).canvas;
  }

  return {
    canvas: result.canvas,
    width: result.width,
    height: result.height,
    data: result.data,
    stripCanvas,
    framePlan: usePlan,
  };
}

export function brightnessAt(map: DepthMap, x: number, y: number): number {
  const i = (y * map.width + x) * 4;
  const r = map.data[i];
  const g = map.data[i + 1];
  const b = map.data[i + 2];
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}
