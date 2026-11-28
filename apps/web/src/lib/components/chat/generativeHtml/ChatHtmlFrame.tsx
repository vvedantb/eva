"use client";

import { Button, tokenTransition } from "@vvedantb/ui";
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

const SANDBOX = "allow-scripts allow-forms allow-popups";

const PAGE_TOKEN_SOURCE: Partial<Record<string, string>> = {
  "--card": "--surface-card",
  "--card-foreground": "--surface-foreground",
  "--popover": "--overlay",
  "--popover-foreground": "--overlay-foreground",
  "--muted": "--surface-secondary",
  "--muted-foreground": "--muted",
  "--secondary": "--default",
  "--secondary-foreground": "--default-foreground",
  "--primary": "--accent",
  "--primary-foreground": "--accent-foreground",
  "--accent": "--accent-soft",
  "--accent-foreground": "--accent-soft-foreground",
  "--ring": "--focus",
  "--destructive": "--danger",
  "--destructive-foreground": "--danger-foreground",
};

function readHostContext(theme: HtmlRenderAppearance): HtmlRenderHostContext {
  const style = getComputedStyle(document.documentElement);
  const variables: Record<string, string> = {};
  for (const name of HTML_RENDER_THEME_VARIABLES) {
    const value = htmlRenderThemeValue(
      style.getPropertyValue(PAGE_TOKEN_SOURCE[name] ?? name),
    );
    if (value !== "") variables[name] = value;
  }
  return { theme, styles: { variables } };
}

/**
 * One agent-authored HTML page (`render_html`) in the transcript. The page
 * loads on mount; until then its box holds the agent's height so nothing
 * below it moves.
 */
export function ChatHtmlFrame({ render }: { render: Doc<"chatHtmlRenders"> }) {
  const html = useQuery(api.chatHtml.getHtml, { renderId: render._id });
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tokenTransition.fast}
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
  const [srcDoc] = useState(() =>
    injectHtmlRenderBootstrap(html, readHostContext(resolvedTheme)),
  );
  const [reportedHeight, setReportedHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      iframeRef.current?.contentWindow?.postMessage(
        htmlRenderHostContextMessage(readHostContext(resolvedTheme)),
        "*",
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

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
        style={{ colorScheme: resolvedTheme }}
      />
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
