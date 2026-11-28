"use client";

import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  WebPreviewNavigationButton,
  RefreshSpinIcon,
} from "@vvedantb/ui";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconExternalLink,
  IconMaximize,
} from "@tabler/icons-react";
import { stripPreviewGrant, carryPreviewGrant } from "@/lib/utils/previewGrant";
import { PREVIEW_FRAME_MESSAGE } from "@eva/shared/previewFrameMessages";
import { isFromFrame, postToFrame } from "@/lib/utils/frameMessaging";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { PreviewPathInput } from "./PreviewPathInput";
import {
  setPreviewDocumentLoading,
  usePreviewDocumentLoading,
} from "./sandbox/previewDocumentLoading";
import { normalizePreviewPath } from "./previewPathHistory";

export { normalizePreviewPath };

function getPathFromUrl(fullUrl: string): string {
  try {
    const parsed = new URL(stripPreviewGrant(fullUrl));
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "/";
  }
}

export function buildUrlWithPath(baseUrl: string, path: string): string {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol === "http:") parsed.protocol = "https:";
    const fullPath = normalizePreviewPath(path);
    return carryPreviewGrant(baseUrl, `${parsed.origin}${fullPath}`);
  } catch {
    return baseUrl;
  }
}

function readIframeHref(iframe: HTMLIFrameElement | null): string | null {
  const frameWindow = iframe?.contentWindow;
  if (!frameWindow) return null;
  try {
    return frameWindow.location.href;
  } catch {
    return null;
  }
}

function stepIframeHistory(
  iframe: HTMLIFrameElement | null,
  direction: "back" | "forward",
): boolean {
  const frameWindow = iframe?.contentWindow;
  if (!frameWindow) return false;
  try {
    if (direction === "back") {
      frameWindow.history.back();
    } else {
      frameWindow.history.forward();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * A named dev-server port the preview can switch to. Multi-repo sessions offer
 * one per checked-out repo; a single-repo session passes none and the port
 * stays a plain text input.
 */
export interface PreviewPortOption {
  port: number;
  label: string;
}

interface PreviewNavBarProps {
  previewUrl: string | null;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  iframeElement?: HTMLIFrameElement | null;
  containerRef: RefObject<HTMLDivElement | null>;
  onToggleFullscreen?: () => void;
  port: number;
  path?: string;
  onPortChange?: (port: number) => void;
  portOptions?: readonly PreviewPortOption[];
  defaultPath?: string;
  onPathChange?: (path: string) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
  trailing?: ReactNode;
  externalHrefForPath?: (path: string) => string;
}

type PreviewHistoryCommand =
  | typeof PREVIEW_FRAME_MESSAGE.historyBack
  | typeof PREVIEW_FRAME_MESSAGE.historyForward;

export function PreviewNavBar({
  previewUrl,
  iframeRef,
  iframeElement,
  containerRef,
  onToggleFullscreen,
  port,
  path,
  onPortChange,
  portOptions,
  defaultPath = "/",
  onPathChange,
  isLoading = false,
  onRefresh,
  trailing,
  externalHrefForPath,
}: PreviewNavBarProps) {
  function currentIframe(): HTMLIFrameElement | null {
    return iframeElement !== undefined ? iframeElement : iframeRef.current;
  }
  const simpleView = useSimpleView();
  const documentLoading = usePreviewDocumentLoading(iframeElement ?? null);
  const [portInput, setPortInput] = useState(String(port));
  const [pathDraft, setPathDraft] = useState<string | null>(null);
  const pathInput = pathDraft ?? path ?? defaultPath;
  const lastNotifiedPathRef = useRef<string | null>(null);

  const [prevPort, setPrevPort] = useState(port);
  if (port !== prevPort) {
    setPrevPort(port);
    setPortInput(String(port));
  }

  function settlePath(nextPath: string) {
    setPathDraft(path === undefined ? nextPath : null);
  }

  function notifyPathChange(nextPath: string) {
    if ((path ?? lastNotifiedPathRef.current) === nextPath) return;
    lastNotifiedPathRef.current = nextPath;
    onPathChange?.(nextPath);
  }

  function syncPathFromIframe() {
    const href = readIframeHref(currentIframe());
    if (!href || !/^https?:/i.test(href)) return;
    const nextPath = getPathFromUrl(href);
    settlePath(nextPath);
    notifyPathChange(nextPath);
  }

  const syncPathFromIframeRef = useRef(syncPathFromIframe);
  const notifyPathChangeRef = useRef(notifyPathChange);
  const settlePathRef = useRef(settlePath);
  const currentIframeRef = useRef(currentIframe);
  useEffect(() => {
    syncPathFromIframeRef.current = syncPathFromIframe;
    notifyPathChangeRef.current = notifyPathChange;
    settlePathRef.current = settlePath;
    currentIframeRef.current = currentIframe;
  });

  function postHistoryCommand(type: PreviewHistoryCommand) {
    postToFrame(currentIframe(), { type });
  }

  useEffect(() => {
    const iframe =
      iframeElement !== undefined ? iframeElement : iframeRef.current;
    const onLoad = () => {
      if (iframe) setPreviewDocumentLoading(iframe, false);
      syncPathFromIframeRef.current();
    };
    iframe?.addEventListener("load", onLoad);

    function handleMessage(event: MessageEvent) {
      const source = currentIframeRef.current();
      if (
        source === null ||
        !isFromFrame(event, source) ||
        typeof event.data !== "object" ||
        event.data === null ||
        !("type" in event.data)
      ) {
        return;
      }
      if (event.data.type === PREVIEW_FRAME_MESSAGE.unload) {
        setPreviewDocumentLoading(source, true);
        return;
      }
      if (
        event.data.type === PREVIEW_FRAME_MESSAGE.navigation &&
        "url" in event.data &&
        typeof event.data.url === "string"
      ) {
        const nextPath = getPathFromUrl(event.data.url);
        settlePathRef.current(nextPath);
        notifyPathChangeRef.current(nextPath);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      iframe?.removeEventListener("load", onLoad);
      window.removeEventListener("message", handleMessage);
    };
  }, [iframeRef, iframeElement]);

  function goBack() {
    const handled = stepIframeHistory(currentIframe(), "back");
    if (!handled) {
      postHistoryCommand(PREVIEW_FRAME_MESSAGE.historyBack);
    }
    setTimeout(syncPathFromIframe, 200);
  }

  function goForward() {
    const handled = stepIframeHistory(currentIframe(), "forward");
    if (!handled) {
      postHistoryCommand(PREVIEW_FRAME_MESSAGE.historyForward);
    }
    setTimeout(syncPathFromIframe, 200);
  }

  function reload() {
    const iframe = currentIframe();
    if (iframe) {
      setPreviewDocumentLoading(iframe, true);
      const currentSrc = iframe.src;
      iframe.src = currentSrc;
    }
  }

  function commitPath(path: string = pathInput) {
    const iframe = currentIframe();
    if (!iframe || !previewUrl) return;
    const nextPath = normalizePreviewPath(path);
    settlePath(nextPath);
    notifyPathChange(nextPath);
    setPreviewDocumentLoading(iframe, true);
    iframe.src = buildUrlWithPath(previewUrl, nextPath);
  }

  function commitPort() {
    const parsed = parseInt(portInput, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
      onPortChange?.(parsed);
    } else {
      setPortInput(String(port));
    }
  }

  const openInNewTabHref = externalHrefForPath
    ? externalHrefForPath(normalizePreviewPath(pathInput))
    : previewUrl
      ? stripPreviewGrant(buildUrlWithPath(previewUrl, pathInput))
      : undefined;

  function toggleFullscreen() {
    if (onToggleFullscreen) {
      onToggleFullscreen();
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  }

  function handleOpenInNewTab() {
    if (openInNewTabHref) {
      window.open(openInNewTabHref, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <>
      <WebPreviewNavigationButton tooltip="Back" onClick={goBack}>
        <IconArrowLeft className="w-3.5 h-3.5" />
      </WebPreviewNavigationButton>
      <WebPreviewNavigationButton tooltip="Forward" onClick={goForward}>
        <IconArrowRight className="w-3.5 h-3.5" />
      </WebPreviewNavigationButton>
      <WebPreviewNavigationButton
        tooltip="Reload"
        onClick={isLoading && onRefresh ? onRefresh : reload}
        disabled={isLoading}
      >
        <RefreshSpinIcon
          busy={isLoading || documentLoading}
          className="size-3.5"
        />
      </WebPreviewNavigationButton>
      <PreviewPathInput
        value={pathInput}
        onValueChange={setPathDraft}
        onCommit={commitPath}
      />
      {simpleView ? null : (
        <>
          <Input
            className="h-8 w-14 max-sm:shrink-0 text-base text-center px-1 sm:w-16 sm:text-xs"
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            onBlur={commitPort}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitPort();
            }}
            aria-label="Preview port"
          />
          {portOptions !== undefined && portOptions.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-6 shrink-0 p-0 hover:text-foreground"
                  aria-label="Choose a repository's dev server port"
                >
                  <IconChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {portOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.port}
                    onSelect={() => onPortChange?.(option.port)}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    {option.port === port ? (
                      <IconCheck className="ml-auto size-3.5 shrink-0 text-primary" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      )}
      <WebPreviewNavigationButton
        tooltip="Open in new tab"
        disabled={!previewUrl}
        onClick={handleOpenInNewTab}
      >
        <IconExternalLink className="w-3.5 h-3.5" />
      </WebPreviewNavigationButton>
      <WebPreviewNavigationButton
        tooltip="Fullscreen"
        onClick={toggleFullscreen}
      >
        <IconMaximize className="w-3.5 h-3.5" />
      </WebPreviewNavigationButton>
      {trailing}
    </>
  );
}
