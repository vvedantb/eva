import { z } from "zod";

export const PREVIEW_VIEWPORT_MIN = 240;
export const PREVIEW_VIEWPORT_MAX = 3840;
export const PREVIEW_VIEWPORT_MAX_AREA = 3840 * 2160;
export const PREVIEW_VIEWPORT_RAIL_PX = 10;

const PREVIEW_VIEWPORT_PRESET_IDS = [
  "iphone-se",
  "iphone-xr",
  "iphone-12-pro",
  "iphone-14-pro-max",
  "pixel-7",
  "samsung-galaxy-s8-plus",
  "samsung-galaxy-s20-ultra",
  "ipad-mini",
  "ipad-air",
  "ipad-pro",
  "surface-pro-7",
  "surface-duo",
  "galaxy-z-fold-5",
  "asus-zenbook-fold",
  "samsung-galaxy-a51-71",
  "nest-hub",
  "nest-hub-max",
] as const;

export type PreviewViewportPresetId =
  (typeof PREVIEW_VIEWPORT_PRESET_IDS)[number];

export type PreviewViewport =
  | { mode: "fill" }
  | { mode: "freeform"; width: number; height: number }
  | {
      mode: "preset";
      id: PreviewViewportPresetId;
      width: number;
      height: number;
    };

export type SizedPreviewViewport = Exclude<PreviewViewport, { mode: "fill" }>;

export type PreviewViewportResizeDirection = "east" | "south" | "southeast";

export interface PreviewViewportPreset {
  id: PreviewViewportPresetId;
  label: string;
  category: "Phone" | "Tablet";
  detail: string;
  width: number;
  height: number;
}

const PRESET_DEFINITIONS: Record<
  PreviewViewportPresetId,
  Omit<PreviewViewportPreset, "id">
> = {
  "iphone-se": {
    label: "iPhone SE",
    category: "Phone",
    detail: "375 × 667",
    width: 375,
    height: 667,
  },
  "iphone-xr": {
    label: "iPhone XR",
    category: "Phone",
    detail: "414 × 896",
    width: 414,
    height: 896,
  },
  "iphone-12-pro": {
    label: "iPhone 12 Pro",
    category: "Phone",
    detail: "390 × 844",
    width: 390,
    height: 844,
  },
  "iphone-14-pro-max": {
    label: "iPhone 14 Pro Max",
    category: "Phone",
    detail: "430 × 932",
    width: 430,
    height: 932,
  },
  "pixel-7": {
    label: "Pixel 7",
    category: "Phone",
    detail: "412 × 915",
    width: 412,
    height: 915,
  },
  "samsung-galaxy-s8-plus": {
    label: "Samsung Galaxy S8+",
    category: "Phone",
    detail: "360 × 740",
    width: 360,
    height: 740,
  },
  "samsung-galaxy-s20-ultra": {
    label: "Samsung Galaxy S20 Ultra",
    category: "Phone",
    detail: "412 × 915",
    width: 412,
    height: 915,
  },
  "ipad-mini": {
    label: "iPad Mini",
    category: "Tablet",
    detail: "768 × 1024",
    width: 768,
    height: 1024,
  },
  "ipad-air": {
    label: "iPad Air",
    category: "Tablet",
    detail: "820 × 1180",
    width: 820,
    height: 1180,
  },
  "ipad-pro": {
    label: "iPad Pro",
    category: "Tablet",
    detail: "1024 × 1366",
    width: 1024,
    height: 1366,
  },
  "surface-pro-7": {
    label: "Surface Pro 7",
    category: "Tablet",
    detail: "912 × 1368",
    width: 912,
    height: 1368,
  },
  "surface-duo": {
    label: "Surface Duo",
    category: "Phone",
    detail: "540 × 720",
    width: 540,
    height: 720,
  },
  "galaxy-z-fold-5": {
    label: "Galaxy Z Fold 5",
    category: "Phone",
    detail: "344 × 882",
    width: 344,
    height: 882,
  },
  "asus-zenbook-fold": {
    label: "Asus Zenbook Fold",
    category: "Tablet",
    detail: "853 × 1280",
    width: 853,
    height: 1280,
  },
  "samsung-galaxy-a51-71": {
    label: "Samsung Galaxy A51/71",
    category: "Phone",
    detail: "412 × 914",
    width: 412,
    height: 914,
  },
  "nest-hub": {
    label: "Nest Hub",
    category: "Tablet",
    detail: "1024 × 600",
    width: 1024,
    height: 600,
  },
  "nest-hub-max": {
    label: "Nest Hub Max",
    category: "Tablet",
    detail: "1280 × 800",
    width: 1280,
    height: 800,
  },
};

export const PREVIEW_VIEWPORT_PRESETS: ReadonlyArray<PreviewViewportPreset> =
  PREVIEW_VIEWPORT_PRESET_IDS.map((id) => ({
    id,
    ...PRESET_DEFINITIONS[id],
  }));

export const FILL_PREVIEW_VIEWPORT: PreviewViewport = { mode: "fill" };

const sizeSchema = z.object({
  width: z.number().int().min(PREVIEW_VIEWPORT_MIN).max(PREVIEW_VIEWPORT_MAX),
  height: z.number().int().min(PREVIEW_VIEWPORT_MIN).max(PREVIEW_VIEWPORT_MAX),
});

const previewViewportSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("fill") }),
  z.object({
    mode: z.literal("freeform"),
    width: sizeSchema.shape.width,
    height: sizeSchema.shape.height,
  }),
  z.object({
    mode: z.literal("preset"),
    id: z.enum(PREVIEW_VIEWPORT_PRESET_IDS),
    width: sizeSchema.shape.width,
    height: sizeSchema.shape.height,
  }),
]);

export function serializePreviewViewport(viewport: PreviewViewport): string {
  return JSON.stringify(viewport);
}

export function parsePreviewViewport(raw: string): PreviewViewport {
  try {
    const parsed = previewViewportSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return FILL_PREVIEW_VIEWPORT;
    if (parsed.data.mode === "fill") return parsed.data;
    if (parsed.data.width * parsed.data.height > PREVIEW_VIEWPORT_MAX_AREA) {
      return FILL_PREVIEW_VIEWPORT;
    }
    return parsed.data;
  } catch {
    return FILL_PREVIEW_VIEWPORT;
  }
}

export function migrateLegacyPreviewDevice(raw: string): PreviewViewport {
  if (raw === "tablet") {
    return presetViewport("ipad-mini");
  }
  if (raw === "mobile") {
    return presetViewport("iphone-12-pro");
  }
  return FILL_PREVIEW_VIEWPORT;
}

export function readStoredPreviewViewport(
  viewportKey: string,
  legacyDeviceKey: string,
): PreviewViewport {
  try {
    const stored = sessionStorage.getItem(viewportKey);
    if (stored !== null) return parsePreviewViewport(stored);
    const legacy = sessionStorage.getItem(legacyDeviceKey);
    if (legacy === null) return FILL_PREVIEW_VIEWPORT;
    const migrated = migrateLegacyPreviewDevice(legacy);
    sessionStorage.setItem(viewportKey, serializePreviewViewport(migrated));
    sessionStorage.removeItem(legacyDeviceKey);
    return migrated;
  } catch {
    return FILL_PREVIEW_VIEWPORT;
  }
}

export function findPreviewViewportPreset(
  id: string,
): PreviewViewportPreset | undefined {
  return PREVIEW_VIEWPORT_PRESETS.find((preset) => preset.id === id);
}

export function presetViewport(
  id: PreviewViewportPresetId,
  orientation?: "portrait" | "landscape",
): SizedPreviewViewport {
  const preset = PRESET_DEFINITIONS[id];
  const nativePortrait = preset.height >= preset.width;
  const landscape = orientation === "landscape";
  const portrait = orientation === "portrait";
  const shouldSwap =
    (landscape && nativePortrait) || (portrait && !nativePortrait);
  return {
    mode: "preset",
    id,
    width: shouldSwap ? preset.height : preset.width,
    height: shouldSwap ? preset.width : preset.height,
  };
}

function clampPreviewDimension(value: number): number {
  if (!Number.isFinite(value)) return PREVIEW_VIEWPORT_MIN;
  return Math.min(
    PREVIEW_VIEWPORT_MAX,
    Math.max(PREVIEW_VIEWPORT_MIN, Math.round(value)),
  );
}

export function clampPreviewViewportSize(size: {
  width: number;
  height: number;
}): { width: number; height: number } {
  let width = clampPreviewDimension(size.width);
  let height = clampPreviewDimension(size.height);
  if (width * height <= PREVIEW_VIEWPORT_MAX_AREA) return { width, height };
  const scale = Math.sqrt(PREVIEW_VIEWPORT_MAX_AREA / (width * height));
  width = clampPreviewDimension(width * scale);
  height = clampPreviewDimension(height * scale);
  if (width * height > PREVIEW_VIEWPORT_MAX_AREA) {
    height = Math.max(
      PREVIEW_VIEWPORT_MIN,
      Math.floor(PREVIEW_VIEWPORT_MAX_AREA / width),
    );
  }
  return { width, height };
}

export function snapshotFillViewport(rect: {
  width: number;
  height: number;
}): SizedPreviewViewport {
  const size = clampPreviewViewportSize({
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
  return { mode: "freeform", ...size };
}

export function rotatePreviewViewport(
  viewport: SizedPreviewViewport,
): SizedPreviewViewport {
  return {
    ...viewport,
    width: viewport.height,
    height: viewport.width,
  };
}

function resizeAtAspectRatio(
  desired: number,
  aspectRatio: number,
  primaryAxis: "width" | "height",
): { width: number; height: number } {
  if (primaryAxis === "width") {
    const width = clampPreviewDimension(desired);
    const height = clampPreviewDimension(width / aspectRatio);
    return clampPreviewViewportSize({ width, height });
  }
  const height = clampPreviewDimension(desired);
  const width = clampPreviewDimension(height * aspectRatio);
  return clampPreviewViewportSize({ width, height });
}

export function resizePreviewViewport(
  start: { width: number; height: number },
  delta: { x: number; y: number },
  direction: PreviewViewportResizeDirection,
  aspectRatio: number | null,
): { width: number; height: number } {
  const horizontal = direction === "south" ? 0 : delta.x;
  const vertical = direction === "east" ? 0 : delta.y;
  const desiredWidth = start.width + horizontal;
  const desiredHeight = start.height + vertical;
  if (aspectRatio !== null && Number.isFinite(aspectRatio) && aspectRatio > 0) {
    const controlsWidth = direction !== "south";
    const controlsHeight = direction !== "east";
    const primaryAxis =
      controlsWidth && !controlsHeight
        ? "width"
        : controlsHeight && !controlsWidth
          ? "height"
          : Math.abs(desiredWidth - start.width) / start.width >=
              Math.abs(desiredHeight - start.height) / start.height
            ? "width"
            : "height";
    return resizeAtAspectRatio(
      primaryAxis === "width" ? desiredWidth : desiredHeight,
      aspectRatio,
      primaryAxis,
    );
  }
  return clampPreviewViewportSize({
    width: desiredWidth,
    height: desiredHeight,
  });
}

export { previewIframeScale } from "@/lib/components/sandbox/previewContain";

export function fittedPreviewContainStyle(logical: {
  width: number;
  height: number;
}): {
  width: string;
  height: string;
} {
  return {
    width: `min(100cqw, ${logical.width}px, calc(100cqh * ${logical.width} / ${logical.height}))`,
    height: `min(100cqh, ${logical.height}px, calc(100cqw * ${logical.height} / ${logical.width}))`,
  };
}

export function sizedPreviewViewport(
  viewport: PreviewViewport,
): SizedPreviewViewport | null {
  return viewport.mode === "fill" ? null : viewport;
}

const DEFAULT_CONTAIN_SIZE = { width: 1280, height: 800 };

const containSizeSchema = z.object({
  width: z.number().finite(),
  height: z.number().finite(),
});

/**
 * Locked guest box for the preview-bar contain toggle (fill + letterbox).
 *
 * This reads sessionStorage, so anything can be on the other end of it — a
 * value an older build wrote in another shape, or a hand-edited entry. Coercing
 * with `Number()` turned every one of those into NaN, which the clamp floors to
 * the 240px minimum: the preview letterboxed to a 240×240 stamp and stayed that
 * way across reloads. Reject the whole value instead and fall back.
 */
export function parsePreviewContainSize(raw: string): {
  width: number;
  height: number;
} {
  try {
    const parsed = containSizeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { ...DEFAULT_CONTAIN_SIZE };
    const size = snapshotFillViewport(parsed.data);
    return { width: size.width, height: size.height };
  } catch {
    return { ...DEFAULT_CONTAIN_SIZE };
  }
}

export function serializePreviewContainSize(size: {
  width: number;
  height: number;
}): string {
  return JSON.stringify(clampPreviewViewportSize(size));
}

export interface PreviewContainSize {
  width: number;
  height: number;
}

/** The three pieces of pane state the two toolbar toggles move between. */
export interface PreviewFraming {
  viewport: PreviewViewport;
  /** Fill mode only: letterbox `containSize` instead of reflowing the guest. */
  contain: boolean;
  containSize: PreviewContainSize;
}

export interface PreviewFramingChange extends PreviewFraming {
  /** An aspect lock belongs to one box; a new box has to drop it. */
  resetAspectRatio: boolean;
}

/**
 * The viewport the pane actually paints.
 *
 * Contain applies to `fill` only. A device viewport is already a locked box
 * that the frame letterboxes on its own, so honouring a leftover `contain`
 * flag there would paint the stored contain size instead of the chosen
 * device — a phone preview silently rendering at 1280×800.
 */
export function framedPreviewViewport(
  viewport: PreviewViewport,
  contain: boolean,
  containSize: PreviewContainSize,
): PreviewViewport {
  if (viewport.mode !== "fill") return viewport;
  if (!contain) return FILL_PREVIEW_VIEWPORT;
  return { mode: "freeform", ...containSize };
}

/**
 * Device toggle: a sized viewport goes back to fill, and fill snapshots the
 * live pane rect so the guest keeps its current size while gaining a frame.
 *
 * Either way contain drops. Leaving it set is what makes the pane letterbox
 * to a box the user never chose the next time they land in fill mode.
 */
export function togglePreviewDevice(
  current: PreviewFraming,
  fillRect: { width: number; height: number } | null,
): PreviewFramingChange {
  if (current.viewport.mode !== "fill") {
    return {
      viewport: FILL_PREVIEW_VIEWPORT,
      contain: false,
      containSize: current.containSize,
      resetAspectRatio: true,
    };
  }
  return {
    viewport: snapshotFillViewport({
      width: fillRect?.width ?? DEFAULT_CONTAIN_SIZE.width,
      height: fillRect?.height ?? DEFAULT_CONTAIN_SIZE.height,
    }),
    contain: false,
    containSize: current.containSize,
    resetAspectRatio: false,
  };
}

/**
 * Contain toggle. From a device viewport this hands the device's box over to
 * contain and drops back to fill, so the same pixels keep being shown — the
 * device size would otherwise be lost the moment the frame came off.
 *
 * From fill it is a plain flip that keeps the stored box (default 1280×800)
 * rather than snapshotting the pane: a snapshot matches the pane exactly and
 * looks like a dead button until the splitter moves.
 */
export function togglePreviewContain(
  current: PreviewFraming,
): PreviewFramingChange {
  if (current.viewport.mode !== "fill") {
    return {
      viewport: FILL_PREVIEW_VIEWPORT,
      contain: true,
      containSize: {
        width: current.viewport.width,
        height: current.viewport.height,
      },
      resetAspectRatio: true,
    };
  }
  return {
    viewport: current.viewport,
    contain: !current.contain,
    containSize: current.containSize,
    resetAspectRatio: false,
  };
}
