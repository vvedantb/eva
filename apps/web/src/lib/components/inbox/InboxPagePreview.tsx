"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Spinner } from "@vvedantb/ui";
import {
  EMBED_CHAT_ONLY_NAME,
  embedFocus,
  embedNavigate,
  embedReadyMessage,
} from "@/lib/embed/embedded";

/**
 * Asks the embedded chat to focus its composer (R) or its open question (Q).
 * Focus moves into the frame first, so the embedded element can take it.
 */
export function focusInboxFrame(
  frame: HTMLIFrameElement | null,
  target: "composer" | "question",
): void {
  const window_ = frame?.contentWindow;
  if (!frame || !window_) return;
  frame.focus();
  window_.postMessage(embedFocus(target), window.location.origin);
}

/**
 * The selected row's page, embedded as a same-origin iframe running the app in
 * chromeless mode (see `lib/embed/embedded.ts`). A chat row shows the chat
 * only (`chatOnly`); an alert shows its whole page. One iframe persists
 * across selections: once the embedded app announces `eva:embed-ready`,
 * switching rows posts `eva:embed-navigate` and the embedded router navigates
 * in place. Until that handshake (or if it never arrives), switches fall back
 * to swapping the iframe src. The parent keeps `frameRef` for the R and Q keys.
 */
export function InboxPagePreview({
  href,
  chatOnly,
  frameRef,
}: {
  href: string;
  chatOnly: boolean;
  frameRef: RefObject<HTMLIFrameElement | null>;
}) {
  const readyRef = useRef(false);
  const [booted, setBooted] = useState(false);
  // The src and name only seed the first document; later rows arrive via postMessage.
  const [initial] = useState({ href, chatOnly });

  /* eslint-disable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change --
     Drives an iframe: either postMessage into the embedded document or swap its
     `src`. Both are writes to another window, not state this component owns. */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (readyRef.current && frame.contentWindow) {
      frame.contentWindow.postMessage(
        embedNavigate(href, chatOnly),
        window.location.origin,
      );
      return;
    }
    if (frame.getAttribute("src") !== href) {
      setBooted(false);
      frame.setAttribute("name", chatOnly ? EMBED_CHAT_ONLY_NAME : "");
      frame.setAttribute("src", href);
    }
  }, [href, chatOnly, frameRef]);
  /* eslint-enable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change */

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (embedReadyMessage.safeParse(event.data).success) {
        readyRef.current = true;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameRef]);

  return (
    <div className="relative min-h-0 flex-1">
      {!booted ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : null}
      <iframe
        ref={frameRef}
        src={initial.href}
        name={initial.chatOnly ? EMBED_CHAT_ONLY_NAME : undefined}
        onLoad={() => setBooted(true)}
        title="Inbox page preview"
        className="absolute inset-0 size-full border-0 bg-background"
      />
    </div>
  );
}
