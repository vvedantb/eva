"use client";

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  EMBED_READY_MESSAGE,
  embedFocusMessage,
  embedNavigateMessage,
  setEmbedChatOnly,
} from "@/lib/embed/embedded";
import {
  QUESTION_DOCK_SELECTOR,
  requestComposerFocus,
} from "@/lib/components/chat/composerFocusRequest";
import { hrefToNavigateOptions } from "@/lib/utils/repoUrl";

/**
 * Embedded-side half of the inbox preview bridge (mounted only when
 * IS_EMBEDDED). Announces readiness to the parent, then serves its
 * `eva:embed-navigate` messages via client-side navigation — so switching
 * rows in the host pane never reloads this document — and its
 * `eva:embed-focus` messages (the Inbox's R and Q keys).
 */
export function EmbedNavigationBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== window.parent) return;
      const focus = embedFocusMessage.safeParse(event.data);
      if (focus.success) {
        if (focus.data.target === "composer") requestComposerFocus();
        else focusOpenQuestion();
        return;
      }
      const parsed = embedNavigateMessage.safeParse(event.data);
      if (!parsed.success) return;
      setEmbedChatOnly(parsed.data.chatOnly);
      navigate(hrefToNavigateOptions(parsed.data.href));
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage(EMBED_READY_MESSAGE, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  return null;
}

function focusOpenQuestion(): void {
  const dock = document.querySelector(QUESTION_DOCK_SELECTOR);
  const first = dock?.querySelector("button");
  if (!(first instanceof HTMLElement)) return;
  first.scrollIntoView({ block: "nearest" });
  first.focus();
}
