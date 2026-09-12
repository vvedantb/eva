import { z } from "zod";

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
/** App-internal path only — rejects protocol-relative and absolute URLs. */
export function isInternalAppHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !href.includes("://");
}

export const embedNavigateMessage = z.object({
  type: z.literal("eva:embed-navigate"),
  href: z.string().refine(isInternalAppHref, {
    message: "href must be an app-internal path",
  }),
});

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
