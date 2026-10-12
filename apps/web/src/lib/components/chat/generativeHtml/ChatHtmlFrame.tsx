"use client";

import { Button, motionFast } from "@eva/ui";
import { api, type Doc } from "@eva/backend";
import {
  HTML_RENDER_SIZE_CHANGED,
  HTML_RENDER_THEME_VARIABLES,
  htmlRenderFrameHeight,
  htmlRenderFrameMessage,
  htmlRenderHostContextMessage,
  htmlRenderThemeValue,
  injectHtmlRenderBootstrap,
  type HtmlRenderAppearance,
  type HtmlRenderHostContext,
} from "@eva/shared/htmlRender";
import { IconMaximize } from "@tabler/icons-react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useThemeMode } from "@/lib/hooks/useThemeMode";

/**
 * The same flags T3 Code gives agent pages. No `allow-same-origin`: the page
 * runs in an opaque origin and cannot reach Eva's cookies, storage or DOM.
 * Forms and popups stay usable inside that sandbox.
 */
const SANDBOX = "allow-scripts allow-forms allow-popups";

/** Eva's live theme tokens, as complete CSS values, for the page's `:root`. */
function readHostContext(theme: HtmlRenderAppearance): HtmlRenderHostContext {
  const style = getComputedStyle(document.documentElement);
  const variables: Record<string, string> = {};
  for (const name of HTML_RENDER_THEME_VARIABLES) {
    const value = htmlRenderThemeValue(style.getPropertyValue(name));
    if (value !== "") variables[name] = value;
  }
  return { theme, styles: { variables } };
}

/**
 * One agent-authored HTML page (`render_html`) in the transcript. The page
 * loads on mount; until then its box holds the agent's height so nothing
 * below it moves.
 */
export function ChatHtmlFrame({
  render,
}: {
  render: Doc<"chatHtmlRenders">;
}) {
  const html = useQuery(api.chatHtml.getHtml, { renderId: render._id });
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionFast}
      data-testid="chat-html-frame"
    >
      {html === undefined ? (
        <div style={{ height: render.height }} />
      ) : html === null ? (
        <p className="text-muted-foreground text-xs">
          Unable to load {render.title}
        </p>
      ) : (
        <HtmlPage html={html} title={render.title} height={render.height} />
      )}
    </m.div>
  );
}

function HtmlPage({
  html,
  title,
  height,
}: {
  html: string;
  title: string;
  height: number;
}) {
  const { resolvedTheme } = useThemeMode();
  // Built once, with the theme of the moment for a correct first paint. A new
  // srcdoc would reload the page and drop its state, so later theme changes
  // go through postMessage instead.
  const [srcDoc] = useState(() =>
    injectHtmlRenderBootstrap(html, readHostContext(resolvedTheme)),
  );
  // The page reports its own height; until then the agent's height holds.
  const [reportedHeight, setReportedHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // The iframe is an external system: push each theme change into it. Read on
  // the next frame, because `ThemeModeProvider` applies the root classes in
  // its own effect, which runs after this child's.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      iframeRef.current?.contentWindow?.postMessage(
        htmlRenderHostContextMessage(readHostContext(resolvedTheme)),
        "*",
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  // Listens for this page's bridge messages for as long as the iframe is
  // mounted. Messages from any other window, or that fail the parse, are
  // ignored.
  const attachFrame = (iframe: HTMLIFrameElement | null) => {
    iframeRef.current = iframe;
    if (!iframe) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      const parsed = htmlRenderFrameMessage.safeParse(event.data);
      if (!parsed.success) return;
      if (parsed.data.method === HTML_RENDER_SIZE_CHANGED) {
        setReportedHeight(parsed.data.params.height);
      } else {
        window.open(parsed.data.params.url, "_blank", "noopener");
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      iframeRef.current = null;
    };
  };

  // Same toggle as the preview and custom-tab panels. The browser's
  // fullscreen styles size the box to the screen, over its inline height.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current?.requestFullscreen();
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative [&:fullscreen]:bg-background [&:fullscreen]:p-6"
      style={{ height: htmlRenderFrameHeight(height, reportedHeight) }}
    >
      <iframe
        ref={attachFrame}
        title={title}
        srcDoc={srcDoc}
        sandbox={SANDBOX}
        loading="lazy"
        className="block size-full border-0"
        // Matches the page's own color-scheme, so the frame stays transparent
        // on the chat background instead of painting an opaque canvas.
        style={{ colorScheme: resolvedTheme }}
      />
      {/* Always shown: the pointer over a cross-document iframe gives the
          parent no hover, so a hover-revealed control never appears. */}
      <Button
        size="icon"
        variant="secondary"
        className="absolute right-2 top-2 size-8"
        aria-label="Toggle fullscreen"
        onClick={toggleFullscreen}
      >
        <IconMaximize className="w-4 h-4" />
      </Button>
    </div>
  );
}
