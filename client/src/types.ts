export type FrameShape = "none" | "ring" | "roundedRect";

export type SnapDimension = "tileScale" | "cornerRadius" | "width" | "height";

export interface FrameConfig {
  shape: FrameShape;
  tileId: string | null;

  ringOuterDiameterMm: number;

  rectOuterWidthMm: number;
  rectOuterHeightMm: number;
  rectCornerRadiusMm: number;
  rectSnapDimension: SnapDimension;

  ringThicknessMm: number;
  tileScaleMm: number;
  // Scales just the tile width along the perimeter (= tile aspect ratio).
  tileScaleFactor: number;
  // Scales the whole decoration relative to text: band thickness AND tile width
  // together, so each tile gets uniformly bigger/smaller.
  decorationSizeFactor: number;
}

export interface PlateConfig {
  text: string;
  fontFamily: string;
  fontSizeMm: number;
  widthMm: number;
  heightMm: number;
  baseThicknessMm: number;
  embossHeightMm: number;
  cornerRadiusMm: number;
  textPaddingMm: number;
  outerPaddingMm: number;
  vertexDensity: number;
  customImage: HTMLImageElement | null;
  showVertices: boolean;
  showReferenceObject: boolean;
  frame: FrameConfig;
}

export interface MeshStats {
  depthMapWidthPx: number;
  depthMapHeightPx: number;
  vertexCount: number;
  triangleCount: number;
}

export interface FramePlanSummary {
  shape: Exclude<FrameShape, "none">;
  perimeterMm: number;
  tileRepetitions: number;
  ringOuterDiameterMm?: number;
  rectOuterWidthMm?: number;
  rectOuterHeightMm?: number;
  rectCornerRadiusMm?: number;
  ringThicknessMm: number;
  tileScaleMm: number;
}

export interface TileManifestEntry {
  id: string;
  file: string;
  thumb: string;
  width: number;
  height: number;
}
export const FONT_OPTIONS = [
  // Sans-serif — Regular
  { family: "Arial, sans-serif", label: "Arial", google: null },
  { family: "Helvetica, Arial, sans-serif", label: "Helvetica", google: null },
  { family: '"Inter", sans-serif', label: "Inter (Google)", google: "Inter:wght@400" },

  // Sans-serif — Bold
  { family: "Arial, sans-serif", label: "Arial Bold", google: null, weight: 700 },
  { family: "Helvetica, Arial, sans-serif", label: "Helvetica Bold", google: null, weight: 700 },
  { family: '"Inter", sans-serif', label: "Inter Bold (Google)", google: "Inter:wght@700", weight: 700 },

  // Serif — Regular
  { family: "Georgia, serif", label: "Georgia", google: null },
  { family: '"Times New Roman", serif', label: "Times New Roman", google: null },
  { family: '"Merriweather", serif', label: "Merriweather (Google)", google: "Merriweather:wght@400" },

  // Serif — Bold
  { family: "Georgia, serif", label: "Georgia Bold", google: null, weight: 700 },
  { family: '"Times New Roman", serif', label: "Times New Roman Bold", google: null, weight: 700 },
  { family: '"Merriweather", serif', label: "Merriweather Bold (Google)", google: "Merriweather:wght@700", weight: 700 },
] as const;

export type FontOption = (typeof FONT_OPTIONS)[number];

// Display shape used by the controls dropdown. Wider than FontOption because
// server-rendered entries are appended at runtime from /api/fonts.
export interface FontDisplayOption {
  family: string;
  label: string;
  google: string | null;
  weight?: number;
  serverRendered?: boolean;
}
