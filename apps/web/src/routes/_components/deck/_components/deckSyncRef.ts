import { subscribeDeckMessages } from "./presenterSync";

/**
 * Listens for the other window's position on this deck.
 *
 * Returns a ref callback — attach it to the surface that owns the deck. It
 * re-runs on each render so the handler it registers is never stale, and
 * returns the unsubscribe so React tears the channel down on unmount.
 *
 * Nothing is broadcast from here. A window only announces moves it made
 * itself (see `useDeckNavigation`'s `onMove`), so an applied message can never
 * echo back and the two windows cannot chase each other.
 */
export function deckSyncRef(
  deck: string,
  apply: (slide: number, step: number) => void,
): (el: HTMLElement | null) => (() => void) | undefined {
  return (el) => {
    if (!el) return;
    return subscribeDeckMessages(deck, (msg) => apply(msg.slide, msg.step));
  };
}
