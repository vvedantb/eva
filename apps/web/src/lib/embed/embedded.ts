import { useSyncExternalStore } from "react";
import { z } from "zod";
import { isInternalAppHref } from "@eva/shared/safeUrl";

/**
 * Support for embedding the app inside itself (same-origin iframe), used by
 * the inbox preview pane. The embedded document hides all chrome (sidebar,
 * paddings, overlays) and accepts navigation requests from its parent so the
 * host can switch pages without a full SPA reboot per selection.
 */

/** Sent by the embedded app once its router is mounted and listening. */
export const embedReadyMessage = z.object({
  type: z.literal("eva:embed-ready"),
});

/**
 * Sent by the host pane to navigate the embedded app in place. `href` is an
 * app-internal path only — never a full URL — so a message cannot steer the
 * frame off-origin.
 */
export const embedNavigateMessage = z.object({
  type: z.literal("eva:embed-navigate"),
  href: z.string().refine(isInternalAppHref),
  /** Show only the page's chat (`useEmbedChatOnly`): the Inbox pane for a chat. */
  chatOnly: z.boolean(),
});

/**
 * Sent by the host pane to focus part of the embedded chat: the Inbox's R
 * (reply) and Q (open question) keys.
 */
export const embedFocusMessage = z.object({
  type: z.literal("eva:embed-focus"),
  target: z.enum(["composer", "question"]),
});

/** The readiness announcement, built from its schema so the name cannot drift. */
export const EMBED_READY_MESSAGE: z.infer<typeof embedReadyMessage> = {
  type: embedReadyMessage.shape.type.value,
};

/** A navigate request for the embedded app, built from its schema. */
export function embedNavigate(
  href: string,
  chatOnly: boolean,
): z.input<typeof embedNavigateMessage> {
  return { type: embedNavigateMessage.shape.type.value, href, chatOnly };
}

/** A focus request for the embedded chat, built from its schema. */
export function embedFocus(
  target: z.infer<typeof embedFocusMessage>["target"],
): z.input<typeof embedFocusMessage> {
  return { type: embedFocusMessage.shape.type.value, target };
}

function detectEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  if (window.self === window.top) return false;
  try {
    return window.parent.location.origin === window.location.origin;
  } catch {
    // Cross-origin parent: some other site framing us — keep full chrome.
    return false;
  }
}

/**
 * True when this document runs inside a same-origin iframe (the inbox preview
 * pane). Computed once at module scope — iframe-ness cannot change during a
 * document's lifetime, so no hook plumbing is needed.
 */
export const IS_EMBEDDED = detectEmbedded();

/**
 * The iframe `name` that boots the embedded app in chat-only mode. A name, not
 * a URL param: the embedded document reads it before its router mounts, and
 * later switches arrive with each `eva:embed-navigate`.
 */
export const EMBED_CHAT_ONLY_NAME = "eva-embed-chat";

let embedChatOnly = IS_EMBEDDED && window.name === EMBED_CHAT_ONLY_NAME;
const chatOnlyListeners = new Set<() => void>();

/** Switches chat-only mode (from the host's navigate message). */
export function setEmbedChatOnly(next: boolean): void {
  if (embedChatOnly === next) return;
  embedChatOnly = next;
  for (const listener of chatOnlyListeners) listener();
}

function subscribeChatOnly(listener: () => void): () => void {
  chatOnlyListeners.add(listener);
  return () => chatOnlyListeners.delete(listener);
}

/**
 * True while the Inbox pane shows this embedded page as a chat only: chat
 * layouts (`ResizablePanelLayout` `chatPane`) drop their side panel or list.
 */
export function useEmbedChatOnly(): boolean {
  return useSyncExternalStore(
    subscribeChatOnly,
    () => embedChatOnly,
    () => false,
  );
}
