"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  fittedPreviewContainStyle,
  PREVIEW_VIEWPORT_RAIL_PX,
  resizePreviewViewport,
  sizedPreviewViewport,
  type PreviewViewport,
  type PreviewViewportResizeDirection,
} from "../_utils/previewViewport";

const HANDLES: ReadonlyArray<{
  direction: PreviewViewportResizeDirection;
  label: string;
  className: string;
}> = [
  {
    direction: "east",
    label: "Resize width",
    className: "inset-y-0 -right-2.5 w-2.5 cursor-ew-resize",
  },
  {
    direction: "south",
    label: "Resize height",
    className: "inset-x-0 -bottom-2.5 h-2.5 cursor-ns-resize",
  },
  {
    direction: "southeast",
    label: "Resize viewport",
    className: "-bottom-2.5 -right-2.5 size-2.5 cursor-nwse-resize",
  },
];

function PreviewViewportResizeHandles({
  width,
  height,
  aspectRatio,
  onResize,
}: {
  width: number;
  height: number;
  aspectRatio: number | null;
  onResize: (size: { width: number; height: number }) => void;
}) {
  function onPointerDown(
    direction: PreviewViewportResizeDirection,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    // Listen on the captured handle, not window, and end on
    // `lostpointercapture`: it fires after pointerup/cancel and also when the
    // browser drops capture (window blur, alt-tab). A window `pointerup` never
    // arrives when the release lands in the preview iframe or another app,
    // which left the drag stuck to the cursor.
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const originX = event.clientX;
    const originY = event.clientY;
    const start = { width, height };
    const locked = aspectRatio;
    const pointerId = event.pointerId;

    function onMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      if (moveEvent.buttons === 0) {
        onEnd(moveEvent);
        return;
      }
      onResize(
        resizePreviewViewport(
          start,
          {
            x: moveEvent.clientX - originX,
            y: moveEvent.clientY - originY,
          },
          direction,
          locked,
        ),
      );
    }

    function onEnd(endEvent: PointerEvent) {
      if (endEvent.pointerId !== pointerId) return;
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("lostpointercapture", onEnd);
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("lostpointercapture", onEnd);
  }

  return (
    <>
      {HANDLES.map((handle) => (
        <button
          key={handle.direction}
          type="button"
          aria-label={handle.label}
          className={`absolute z-10 touch-none border-0 bg-transparent p-0 outline-none hover:bg-foreground/10 focus-visible:bg-foreground/15 ${handle.className}`}
          onPointerDown={(event) => onPointerDown(handle.direction, event)}
        />
      ))}
    </>
  );
}

export function PreviewViewportFrame({
  viewport,
  aspectRatio,
  onResize,
  children,
}: {
  viewport: PreviewViewport;
  aspectRatio: number | null;
  onResize: (size: { width: number; height: number }) => void;
  children: ReactNode;
}) {
  const sized = sizedPreviewViewport(viewport);
  if (!sized) {
    return <div className="relative min-h-0 flex-1">{children}</div>;
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 items-center justify-center bg-muted"
      style={{
        containerType: "size",
        padding: PREVIEW_VIEWPORT_RAIL_PX,
      }}
    >
      <div className="relative" style={fittedPreviewContainStyle(sized)}>
        <PreviewViewportResizeHandles
          width={sized.width}
          height={sized.height}
          aspectRatio={aspectRatio}
          onResize={onResize}
        />
        {children}
      </div>
    </div>
  );
}
