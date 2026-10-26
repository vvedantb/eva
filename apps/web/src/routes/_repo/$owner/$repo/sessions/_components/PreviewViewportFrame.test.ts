import { isValidElement, type ReactNode } from "react";
import { expect, test } from "vitest";
import { PreviewViewportFrame } from "./PreviewViewportFrame";

/**
 * Regression (fix #1031): a viewport resize drag stayed stuck to the cursor
 * when the release landed in the preview iframe or another app, or the window
 * lost focus. The drag listened for `pointerup` on window, which never
 * arrived. It now listens on the captured handle and ends on
 * `lostpointercapture`, or on a move with no button held.
 */

const POINTER_ID = 7;

class FakeHandle extends EventTarget {
  captured = new Set<number>();
  setPointerCapture(pointerId: number) {
    this.captured.add(pointerId);
  }
  hasPointerCapture(pointerId: number) {
    return this.captured.has(pointerId);
  }
  releasePointerCapture(pointerId: number) {
    this.captured.delete(pointerId);
  }
}

interface HandleDown {
  button: number;
  pointerId: number;
  clientX: number;
  clientY: number;
  currentTarget: FakeHandle;
  preventDefault: () => void;
}

interface TreeProps {
  children?: ReactNode;
  "aria-label"?: string;
  onPointerDown?: (event: HandleDown) => void;
}

function startDrag(label: string) {
  const sizes: Array<{ width: number; height: number }> = [];
  const tree = PreviewViewportFrame({
    viewport: { mode: "freeform", width: 800, height: 600 },
    aspectRatio: null,
    onResize: (size) => sizes.push(size),
    children: null,
  });
  const onPointerDown = findHandle(tree, label);
  expect(onPointerDown, `no "${label}" handle`).toBeDefined();
  const handle = new FakeHandle();
  onPointerDown?.({
    button: 0,
    pointerId: POINTER_ID,
    clientX: 0,
    clientY: 0,
    currentTarget: handle,
    preventDefault: () => {},
  });
  return { handle, sizes };
}

function findHandle(
  node: ReactNode,
  label: string,
): TreeProps["onPointerDown"] {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findHandle(child, label);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<TreeProps>(node)) return undefined;
  if (node.props["aria-label"] === label) return node.props.onPointerDown;
  if (typeof node.type === "function") {
    // Expand the hook-free handles component to reach its buttons.
    return findHandle(Reflect.apply(node.type, undefined, [node.props]), label);
  }
  return findHandle(node.props.children, label);
}

function pointer(
  type: string,
  init: { buttons?: number; clientX?: number; pointerId?: number } = {},
) {
  return Object.assign(new Event(type), {
    pointerId: init.pointerId ?? POINTER_ID,
    buttons: init.buttons ?? 1,
    clientX: init.clientX ?? 0,
    clientY: 0,
  });
}

test("a drag on the captured handle resizes the viewport", () => {
  const { handle, sizes } = startDrag("Resize width");
  expect(handle.hasPointerCapture(POINTER_ID)).toBe(true);

  handle.dispatchEvent(pointer("pointermove", { clientX: 100 }));

  expect(sizes).toEqual([{ width: 900, height: 600 }]);
});

test("losing pointer capture ends the drag", () => {
  const { handle, sizes } = startDrag("Resize width");
  handle.dispatchEvent(pointer("pointermove", { clientX: 100 }));

  // Fires after pointerup/cancel, and when the browser drops capture on
  // window blur — the cases where a window `pointerup` never arrives.
  handle.captured.delete(POINTER_ID);
  handle.dispatchEvent(pointer("lostpointercapture"));
  handle.dispatchEvent(pointer("pointermove", { clientX: 300 }));

  expect(sizes).toEqual([{ width: 900, height: 600 }]);
});

test("a move with no button held ends the drag and releases capture", () => {
  const { handle, sizes } = startDrag("Resize width");

  handle.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 200 }));
  handle.dispatchEvent(pointer("pointermove", { clientX: 300 }));

  expect(sizes).toEqual([]);
  expect(handle.hasPointerCapture(POINTER_ID)).toBe(false);
});

test("another pointer's capture loss does not end the drag", () => {
  const { handle, sizes } = startDrag("Resize width");

  handle.dispatchEvent(pointer("lostpointercapture", { pointerId: 99 }));
  handle.dispatchEvent(pointer("pointermove", { clientX: 100 }));

  expect(sizes).toEqual([{ width: 900, height: 600 }]);
});
