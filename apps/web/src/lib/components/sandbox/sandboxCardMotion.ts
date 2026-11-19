/**
 * The sandbox card's dock motion (`dockMotion`): it grows out of the active
 * rail tab when the panel opens, shrinks back into it when the panel closes,
 * and settles when the reader switches tabs. The rail is on the card's right.
 */
import { dockNudge, dockPopIn, dockPopOut } from "@/lib/dockMotion";

/* `SandboxPanelFrame` marks its card and arrow with these attributes, so the
   panel layout can find the card it is about to collapse. */
const CARD_SELECTOR = "[data-sandbox-card]";
const ARROW_SELECTOR = ":scope > [data-sandbox-card-arrow]";

/* Scoped to the rail (the frame's first child): panels inside the card, such
   as Review, have tab lists of their own. Relative to the frame. */
export const RAIL_TABLIST_SELECTOR = ':scope > :first-child [role="tablist"]';
export const ACTIVE_TAB_SELECTOR = `${RAIL_TABLIST_SELECTOR} [role="tab"][data-state="active"]`;

function activeTabOf(card: HTMLElement): HTMLElement | null {
  return (
    card.parentElement?.querySelector<HTMLElement>(ACTIVE_TAB_SELECTOR) ?? null
  );
}

function arrowOf(card: HTMLElement): HTMLElement | null {
  return (
    card.parentElement?.querySelector<HTMLElement>(ARROW_SELECTOR) ?? null
  );
}

/** Panel opened: the card grows out of the active tab, then the arrow shows. */
export function popInSandboxCard(card: HTMLElement) {
  dockPopIn(card, activeTabOf(card), "right", arrowOf(card));
}

/** Tab switch with the panel open: a short settle from the new tab. */
export function nudgeSandboxCard(card: HTMLElement) {
  dockNudge(card, activeTabOf(card), "right");
}

/**
 * Panel closing: shrink the visible card in `root` back into its tab, then
 * run `collapse`. With no visible card, or motion off, it collapses at once.
 */
export function popOutSandboxCard(
  root: HTMLElement | null,
  collapse: () => void,
) {
  const card = root?.querySelector<HTMLElement>(CARD_SELECTOR) ?? null;
  dockPopOut(
    card,
    card ? activeTabOf(card) : null,
    "right",
    collapse,
    card ? arrowOf(card) : null,
  );
}
