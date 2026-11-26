import { z } from "zod";

/** One channel for every deck; the `deck` field keeps the two routes apart. */
const CHANNEL = "eva-deck";
const WINDOW_NAME = "eva-presenter";

/**
 * Anything arriving on a BroadcastChannel is untrusted input from another
 * window, so it is parsed rather than cast.
 */
const message = z.object({
  slide: z.number().int().min(1),
  step: z.number().int().min(0),
  deck: z.string(),
});

export type DeckMessage = z.infer<typeof message>;

export function postDeckMessage(msg: DeckMessage): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(msg);
  channel.close();
}

/** Listens for the *other* window's messages. Returns an unsubscribe. */
export function subscribeDeckMessages(
  deck: string,
  onMessage: (msg: DeckMessage) => void,
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;

  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event) => {
    const parsed = message.safeParse(event.data);
    if (!parsed.success) return;
    if (parsed.data.deck !== deck) return;
    onMessage(parsed.data);
  };
  return () => channel.close();
}

/**
 * Opens the presenter window for a deck. A named window means pressing `p`
 * twice focuses the existing window rather than spawning a second one.
 */
export function openPresenterWindow(basePath: string, slide: number): void {
  const opened = window.open(
    `${basePath}?slide=${slide}&view=presenter`,
    WINDOW_NAME,
    "width=1280,height=800",
  );
  opened?.focus();
}
