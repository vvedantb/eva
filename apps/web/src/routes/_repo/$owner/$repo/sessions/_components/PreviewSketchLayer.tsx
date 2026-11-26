"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { m } from "motion/react";
import {
  IconArrowBackUp,
  IconPaperclip,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  Button,
  Spinner,
  springTransition,
  toast,
} from "@vvedantb/ui";
import { usePendingPreviewSnapshots } from "@/lib/contexts/PendingPreviewSnapshotsContext";
import { requestPreviewScreenshot } from "../_utils/previewScreenshot";
import {
  composeSketchImage,
  drawSketchStrokes,
  nextSketchPoint,
  type SketchStroke,
} from "../_utils/previewSketch";
import { useIframeBox } from "./useIframeBox";

/**
 * A pen surface over the preview. "Attach" lays the ink over a screenshot of
 * the page and adds the image to the composer, so pointing at a problem is
 * one circle instead of a paragraph.
 */
export function PreviewSketchLayer({
  iframeElement,
  onClose,
}: {
  iframeElement: HTMLIFrameElement | null;
  onClose: () => void;
}) {
  const pending = usePendingPreviewSnapshots();
  const box = useIframeBox(iframeElement);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<SketchStroke[]>([]);
  const drawingRef = useRef<SketchStroke | null>(null);
  const [attaching, setAttaching] = useState(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !box) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = box.width * ratio;
    canvas.height = box.height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawSketchStrokes(context, strokes);
  }, [strokes, box]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "z" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setStrokes((current) => current.slice(0, -1));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function pointFor(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function paintTail(stroke: SketchStroke) {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    drawSketchStrokes(context, [stroke.slice(-2)]);
  }

  function attach() {
    if (!iframeElement?.contentWindow || !pending || !box || strokes.length === 0)
      return;
    setAttaching(true);
    requestPreviewScreenshot(iframeElement)
      .then((dataUrl) => composeSketchImage(dataUrl, strokes, box.width))
      .then(
        (file) => {
          pending.addSketch(file);
          toast.success("Sketch attached to your message");
          onClose();
        },
        (error: Error) => {
          toast.error(error.message);
        },
      )
      .finally(() => setAttaching(false));
  }

  if (!box || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed z-50"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="preview-sketch-canvas"
        className="absolute inset-0 size-full cursor-crosshair touch-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const { x, y } = pointFor(event);
          const stroke = [nextSketchPoint(undefined, x, y)];
          drawingRef.current = stroke;
          paintTail(stroke);
        }}
        onPointerMove={(event) => {
          const stroke = drawingRef.current;
          if (!stroke) return;
          const { x, y } = pointFor(event);
          stroke.push(nextSketchPoint(stroke.at(-1), x, y));
          paintTail(stroke);
        }}
        onPointerUp={() => {
          const stroke = drawingRef.current;
          drawingRef.current = null;
          if (stroke) setStrokes((current) => [...current, stroke]);
        }}
      />
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springTransition}
        className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-popover/95 p-1 backdrop-blur-md smooth-shadow-ring-lg"
      >
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Undo stroke"
          disabled={strokes.length === 0}
          onClick={() => setStrokes((current) => current.slice(0, -1))}
        >
          <IconArrowBackUp className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Clear sketch"
          disabled={strokes.length === 0}
          onClick={() => setStrokes([])}
        >
          <IconTrash className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close sketch"
          onClick={onClose}
        >
          <IconX className="size-4" />
        </Button>
        <Button
          size="sm"
          disabled={strokes.length === 0 || attaching}
          onClick={attach}
        >
          {attaching ? <Spinner size="sm" /> : <IconPaperclip className="size-4" />}
          Attach
        </Button>
      </m.div>
    </div>,
    document.body,
  );
}
