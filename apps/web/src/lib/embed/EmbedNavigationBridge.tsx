"use client";

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  EMBED_READY_MESSAGE,
  embedNavigateMessage,
} from "@/lib/embed/embedded";
import { hrefToNavigateOptions } from "@/lib/utils/repoUrl";

/**
 * Embedded-side half of the inbox preview bridge (mounted only when
 * IS_EMBEDDED). Announces readiness to the parent, then serves its
 * `eva:embed-navigate` messages via client-side navigation — so switching
 * notifications in the host pane never reloads this document.
 */
export function EmbedNavigationBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== window.parent) return;
      const parsed = embedNavigateMessage.safeParse(event.data);
      if (!parsed.success) return;
      navigate(hrefToNavigateOptions(parsed.data.href));
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage(EMBED_READY_MESSAGE, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  return null;
}
