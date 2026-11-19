/**
 * macOS dock motion for a panel that docks into a rail tile: it grows out of
 * the tile when shown, shrinks back into it when hidden, and settles when the
 * tile it belongs to changes. Used by the sandbox card (right rail) and the
 * sidebar panel (left rail). The Web Animations API drives it: the motions
 * are one-shot and imperative, and a hide has to finish before the caller
 * removes the panel.
 */

/** Which edge of the panel touches the rail. */
export type DockEdge = "left" | "right";

/** How small the panel gets: close to the tile's size, not a dot. */
const DOCKED_SCALE = 0.12;
const POP_IN_MS = 380;
const POP_OUT_MS = 260;
const SWITCH_MS = 220;
/* Out-quint: fast start, long settle — the panel lands rather than stops. */
const SETTLE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/* In-cubic: accelerates into the tile, as a minimise does. */
const DOCK_EASE = "cubic-bezier(0.5, 0, 0.75, 0)";
const POP_OUT_ID = "dock-pop-out";
/* How long the docked frame holds after a hide: past the sidebar's 280 ms
   width slide, so the panel never shows at full size while it leaves. */
const HOLD_MS = 400;

/**
 * Fired on the panel as a dock motion starts. Overlays painted over the
 * panel from elsewhere (the preview iframe host) cannot follow its
 * transform, so they step aside for `ms`.
 */
export const DOCK_MOTION_EVENT = "dockmotion";
export class DockMotionEvent extends Event {
  readonly ms: number;
  constructor(ms: number) {
    super(DOCK_MOTION_EVENT, { bubbles: true });
    this.ms = ms;
  }
}

/** The "Disable page animations" setting. No `prefers-reduced-motion`
    gate: the web app does not support it (docs/eva-ui.md). */
function motionOff(): boolean {
  return document.documentElement.dataset.pageMotion === "off";
}

/**
 * Points the panel's transform origin at the tile's centre, on the rail
 * edge. False when either is not on screen, so the caller skips the motion.
 * Measure before animating: a scaled panel reports a scaled rect.
 */
function aimAt(panel: HTMLElement, tile: HTMLElement | null, edge: DockEdge) {
  if (!tile || motionOff()) return false;
  const p = panel.getBoundingClientRect();
  // Height, not width: the sidebar's aside slides its width open from 0.
  if (p.height === 0) return false;
  const t = tile.getBoundingClientRect();
  const x = edge === "left" ? "0%" : "100%";
  panel.style.transformOrigin = `${x} ${Math.round(t.top + t.height / 2 - p.top)}px`;
  return true;
}

/** Drops a finished pop-out's held frame (see `dockPopOut`). */
function releaseDocked(el: HTMLElement | null | undefined) {
  for (const a of el?.getAnimations() ?? []) if (a.id === POP_OUT_ID) a.cancel();
}

/** Shown: the panel grows out of the tile. `after` (an arrow, a badge)
    fades in once the panel has nearly landed. */
export function dockPopIn(
  panel: HTMLElement,
  tile: HTMLElement | null,
  edge: DockEdge,
  after?: HTMLElement | null,
) {
  // Always, even when the motion is skipped, or the panel stays invisible.
  releaseDocked(panel);
  releaseDocked(after);
  if (!aimAt(panel, tile, edge)) return;
  panel.dispatchEvent(new DockMotionEvent(POP_IN_MS));
  panel.animate(
    [
      { transform: `scale(${DOCKED_SCALE})`, opacity: 0 },
      { transform: "scale(1.015)", opacity: 1, offset: 0.75 },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: POP_IN_MS, easing: SETTLE_EASE },
  );
  after?.animate(
    [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }],
    { duration: POP_IN_MS },
  );
}

/** The tile changed with the panel shown: a short settle from the new tile. */
export function dockNudge(
  panel: HTMLElement,
  tile: HTMLElement | null,
  edge: DockEdge,
) {
  if (!aimAt(panel, tile, edge)) return;
  panel.dispatchEvent(new DockMotionEvent(SWITCH_MS));
  panel.animate(
    [
      { transform: "scale(0.965)", opacity: 0.4 },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: SWITCH_MS, easing: SETTLE_EASE },
  );
}

/**
 * Hiding: shrink the panel back into the tile, then run `hide`. With no
 * panel or tile on screen, or motion off, it hides at once. A second call
 * while the panel is closing is ignored. `first` (an arrow) fades out early.
 * The docked frame holds for `HOLD_MS` (or until the next `dockPopIn`):
 * the caller may still slide the panel away, and it must stay invisible.
 */
export function dockPopOut(
  panel: HTMLElement | null,
  tile: HTMLElement | null,
  edge: DockEdge,
  hide: () => void,
  first?: HTMLElement | null,
) {
  if (!panel || !aimAt(panel, tile, edge)) {
    hide();
    return;
  }
  const closing = panel
    .getAnimations()
    .some((a) => a.id === POP_OUT_ID && a.playState === "running");
  if (closing) return;
  panel.dispatchEvent(new DockMotionEvent(POP_OUT_MS + HOLD_MS));
  first?.animate([{ opacity: 1 }, { opacity: 0 }], {
    id: POP_OUT_ID,
    duration: POP_OUT_MS / 3,
    fill: "forwards",
  });
  const shrink = panel.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: `scale(${DOCKED_SCALE})`, opacity: 0 },
    ],
    { id: POP_OUT_ID, duration: POP_OUT_MS, easing: DOCK_EASE, fill: "forwards" },
  );
  shrink.onfinish = () => {
    hide();
    setTimeout(() => {
      releaseDocked(panel);
      releaseDocked(first);
    }, HOLD_MS);
  };
}

/**
 * Lets the panels in a `react-resizable-panels` group slide to their next
 * size (`flex-grow` transition, globals.css) instead of jumping, so the
 * neighbour pane moves in step with a pop. Call it just before the resize.
 * Only for this one toggle: a drag must stay 1:1 with the pointer.
 */
export function slideNextResize(
  group: HTMLElement | null,
  direction: "open" | "close",
) {
  if (!group || motionOff()) return;
  const ms = direction === "open" ? POP_IN_MS : POP_OUT_MS;
  group.style.setProperty("--dock-slide-dur", `${ms}ms`);
  group.style.setProperty("--dock-slide-ease", SETTLE_EASE);
  group.dataset.dockSlide = "";
  window.clearTimeout(Number(group.dataset.dockSlideTimer));
  group.dataset.dockSlideTimer = String(
    window.setTimeout(() => {
      delete group.dataset.dockSlide;
    }, ms + 50),
  );
}

