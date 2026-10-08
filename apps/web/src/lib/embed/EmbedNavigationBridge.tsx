"use client";

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { embedNavigateMessage } from "@/lib/embed/embedded";
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
      const parsed = embedNavigateMessage.safeParse(event.data);
      if (!parsed.success) return;
      // Split path from search: a comment notification's href carries
      // `?comment=<id>`, which the router only reads as a separate `search`.
      navigate(hrefToNavigateOptions(parsed.data.href));
    };
    window.addEventListener("message", onMessage);
    // Until this arrives the host falls back to swapping the iframe src, so a
    // selection made mid-boot is never lost.
    window.parent.postMessage(
      { type: "eva:embed-ready" },
      window.location.origin,
    );
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  return null;
}
