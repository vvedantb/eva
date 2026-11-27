/** One sampled pointer position, in CSS pixels of the sketch surface. */
export interface SketchPoint {
  x: number;
  y: number;
  /** Line width at this point. Faster strokes draw thinner, like a pen. */
  width: number;
}

export type SketchStroke = SketchPoint[];

/** Red ink reads on light and dark pages alike, as on a review markup. */
export const SKETCH_INK = "#ef4444";
const MAX_WIDTH = 4;
const MIN_WIDTH = 1.75;
/** Width lost per CSS pixel moved between samples. */
const SPEED_THINNING = 0.12;
/** Share of the new width taken each sample, so width changes stay smooth. */
const WIDTH_EASING = 0.35;

/** The next point of a stroke, its width eased from the previous point. */
export function nextSketchPoint(
  previous: SketchPoint | undefined,
  x: number,
  y: number,
): SketchPoint {
  if (!previous) return { x, y, width: MAX_WIDTH };
  const distance = Math.hypot(x - previous.x, y - previous.y);
  const target = Math.max(MIN_WIDTH, MAX_WIDTH - distance * SPEED_THINNING);
  return {
    x,
    y,
    width: previous.width + (target - previous.width) * WIDTH_EASING,
  };
}

/** Draws strokes; `scale` maps sketch CSS pixels onto the target canvas. */
export function drawSketchStrokes(
  context: CanvasRenderingContext2D,
  strokes: ReadonlyArray<SketchStroke>,
  scale = 1,
): void {
  context.strokeStyle = SKETCH_INK;
  context.fillStyle = SKETCH_INK;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    const [first] = stroke;
    if (!first) continue;
    if (stroke.length === 1) {
      // A tap leaves a dot.
      context.beginPath();
      context.arc(
        first.x * scale,
        first.y * scale,
        (first.width / 2) * scale,
        0,
        Math.PI * 2,
      );
      context.fill();
      continue;
    }
    for (let index = 1; index < stroke.length; index += 1) {
      const from = stroke[index - 1];
      const to = stroke[index];
      if (!from || !to) continue;
      context.beginPath();
      context.lineWidth = ((from.width + to.width) / 2) * scale;
      context.moveTo(from.x * scale, from.y * scale);
      context.lineTo(to.x * scale, to.y * scale);
      context.stroke();
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Couldn't read the screenshot"));
    image.src = src;
  });
}

/**
 * Lays the strokes over the page screenshot and returns one PNG file. The
 * screenshot may be at a higher pixel ratio than the sketch, so the strokes
 * scale to its width.
 */
export async function composeSketchImage(
  screenshotDataUrl: string,
  strokes: ReadonlyArray<SketchStroke>,
  sketchWidth: number,
): Promise<File> {
  const image = await loadImage(screenshotDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't draw the sketch");
  context.drawImage(image, 0, 0);
  drawSketchStrokes(
    context,
    strokes,
    sketchWidth > 0 ? image.naturalWidth / sketchWidth : 1,
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Couldn't save the sketch");
  return new File([blob], `preview-sketch-${Date.now()}.png`, {
    type: "image/png",
  });
}
