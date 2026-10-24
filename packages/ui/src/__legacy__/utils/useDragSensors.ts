import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type SensorDescriptor,
  type SensorOptions,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { DRAG_ACTIVATION_DISTANCE_PX } from "./gesture";

/** How long a finger must rest before a drag arms, in ms. */
const TOUCH_HOLD_MS = 200;

/** How far a finger may stray during the hold without cancelling it, in px. */
const TOUCH_HOLD_TOLERANCE_PX = 10;

/**
 * The house dnd-kit activation split, for every draggable surface.
 *
 * A single `PointerSensor` cannot serve both input types. Mouse arms on
 * **distance**, because dnd-kit's `delay` constraint cancels activation outright
 * when the pointer travels past `tolerance` before the timer fires — so a fast,
 * decisive drag never picks the item up at all. Touch keeps a **hold**, because
 * distance-based activation there competes with the scroll the finger is also
 * describing, and the browser wins: the pointer is cancelled and the drag dies.
 *
 * Keyboard is included so a drag is reachable without a pointer.
 *
 * Pass `{ sortable: true }` inside a `SortableContext`. `sortableKeyboardCoordinates`
 * translates arrow keys into the *next item's* position rather than a raw pixel
 * offset, which is the difference between a keyboard reorder that lands on a row
 * and one that nudges the item a few pixels into nothing. The flag lives here
 * rather than being a `coordinateGetter` each call site imports, because that is
 * exactly what two call sites silently dropped when they adopted this hook. It is
 * opt-in because the getter reads `active.data.current.sortable` and returns
 * nothing without it, so defaulting it on would take keyboard dragging away from
 * the non-sortable surfaces (the gantt bars).
 */
export function useDragSensors({
  sortable = false,
}: { sortable?: boolean } = {}): SensorDescriptor<SensorOptions>[] {
  return useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_HOLD_MS,
        tolerance: TOUCH_HOLD_TOLERANCE_PX,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortable ? sortableKeyboardCoordinates : undefined,
    }),
  );
}
