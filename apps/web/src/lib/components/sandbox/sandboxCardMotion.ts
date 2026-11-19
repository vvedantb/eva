/**
 * The sandbox card's dock motion (macOS-style). The card grows out of the
 * active rail tab when the panel opens, shrinks back into it when the panel
 * closes, and gives a small settle when the reader switches tabs. The Web
 * Animations API drives it: the motions are one-shot and imperative, and the
 * close has to finish before the panel library collapses the pane.
 */

/* `SandboxPanelFrame` marks its card and arrow with these attributes, so the
   panel layout can find the card it is about to collapse. */
const CARD_SELECTOR = "[data-sandbox-card]";
const ARROW_SELECTOR = ":scope > [data-sandbox-card-arrow]";

/* Scoped to the rail (the frame's first child): panels inside the card, such
   as Review, have tab lists of their own. Relative to the frame. */
export const RAIL_TABLIST_SELECTOR = ':scope > :first-child [role="tablist"]';
export const ACTIVE_TAB_SELECTOR = `${RAIL_TABLIST_SELECTOR} [role="tab"][data-state="active"]`;

/** How small the card gets: close to the tab's size, not a dot. */
const DOCKED_SCALE = 0.12;
const POP_IN_MS = 380;
const POP_OUT_MS = 260;
const SWITCH_MS = 220;
/* Out-quint: fast start, long settle — the card lands rather than stops. */
const SETTLE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/* In-cubic: accelerates into the tab, as a minimise does. */
const DOCK_EASE = "cubic-bezier(0.5, 0, 0.75, 0)";
const POP_OUT_ID = "sandbox-card-pop-out";

/** Page motion off (Convex setting) or the OS asks for reduced motion. */
function motionOff(): boolean {
  return (
    document.documentElement.dataset.pageMotion === "off" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Points the card's transform origin at the active tab's centre. */
function aimAtActiveTab(card: HTMLElement): boolean {
  const frame = card.parentElement;
  const tab = frame?.querySelector<HTMLElement>(ACTIVE_TAB_SELECTOR);
  const c = card.getBoundingClientRect();
  if (!tab || c.width === 0) return false;
  const t = tab.getBoundingClientRect();
  card.style.transformOrigin = `100% ${Math.round(t.top + t.height / 2 - c.top)}px`;
  return true;
}

function arrowOf(card: HTMLElement): HTMLElement | null {
  return (
    card.parentElement?.querySelector<HTMLElement>(ARROW_SELECTOR) ?? null
  );
}

/** Panel opened: the card grows out of the active tab, then the arrow shows. */
export function popInSandboxCard(card: HTMLElement) {
  if (motionOff() || !aimAtActiveTab(card)) return;
  card.animate(
    [
      { transform: `scale(${DOCKED_SCALE})`, opacity: 0 },
      { transform: "scale(1.015)", opacity: 1, offset: 0.75 },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: POP_IN_MS, easing: SETTLE_EASE },
  );
  arrowOf(card)?.animate(
    [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }],
    { duration: POP_IN_MS },
  );
}

/** Tab switch with the panel open: a short settle from the new tab. */
export function nudgeSandboxCard(card: HTMLElement) {
  if (motionOff() || !aimAtActiveTab(card)) return;
  card.animate(
    [
      { transform: "scale(0.965)", opacity: 0.4 },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: SWITCH_MS, easing: SETTLE_EASE },
  );
}

/**
 * Panel closing: shrink the visible card in `root` back into its tab, then
 * run `collapse`. With no visible card, or motion off, it collapses at once.
 * A second call while the card is closing is ignored.
 */
export function popOutSandboxCard(
  root: HTMLElement | null,
  collapse: () => void,
) {
  const card = root?.querySelector<HTMLElement>(CARD_SELECTOR);
  if (!card || motionOff() || !aimAtActiveTab(card)) {
    collapse();
    return;
  }
  if (card.getAnimations().some((a) => a.id === POP_OUT_ID)) return;
  const arrow = arrowOf(card);
  const fade = arrow?.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: POP_OUT_MS / 3,
    fill: "forwards",
  });
  const shrink = card.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: `scale(${DOCKED_SCALE})`, opacity: 0 },
    ],
    { id: POP_OUT_ID, duration: POP_OUT_MS, easing: DOCK_EASE, fill: "forwards" },
  );
  shrink.onfinish = () => {
    collapse();
    // Hold the docked frame until the pane has collapsed, so the card does
    // not flash back at full size for one frame.
    requestAnimationFrame(() => {
      shrink.cancel();
      fade?.cancel();
    });
  };
}
