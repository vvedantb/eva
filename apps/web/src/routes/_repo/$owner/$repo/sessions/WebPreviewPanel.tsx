import { useRef, useState } from "react";
import type { Id } from "@eva/backend";
import { cn, Spinner, Button, WebPreview } from "@eva/ui";
import { useSessionStorage } from "usehooks-ts";
import { IconPlayerPlay, IconRefresh, IconWorld } from "@tabler/icons-react";
import {
  buildUrlWithPath,
  normalizePreviewPath,
} from "@/lib/components/PreviewNavBar";
import {
  PersistentPreviewBody,
  useFullscreenElement,
  usePreviewIframeElement,
} from "@/lib/components/sandbox/previewIframeHost";
import { resolveMiniPlayerLogicalSize } from "@/lib/components/sandbox/previewContain";
import {
  closePreviewMiniPlayer,
  openPreviewMiniPlayer,
  usePreviewMiniPlayer,
} from "@/lib/components/sandbox/previewMiniPlayerStore";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { PreviewAnnotationLayer } from "./_components/PreviewAnnotationLayer";
import { PreviewDeviceToolbar } from "./_components/PreviewDeviceToolbar";
import { PreviewFloatingPlaceholder } from "./_components/PreviewFloatingPlaceholder";
import { PreviewPanelNavBar } from "./_components/PreviewPanelNavBar";
import { PreviewViewportFrame } from "./_components/PreviewViewportFrame";
import {
  FILL_PREVIEW_VIEWPORT,
  framedPreviewViewport,
  parsePreviewContainSize,
  parsePreviewViewport,
  readStoredPreviewViewport,
  serializePreviewContainSize,
  serializePreviewViewport,
  togglePreviewContain,
  togglePreviewDevice,
  type PreviewFramingChange,
  type PreviewViewport,
} from "./_utils/previewViewport";

interface PreviewInfo {
  url: string;
  port: number;
}

interface WebPreviewPanelProps {
  isActive: boolean;
  sandboxId: string | undefined;
  previewInfo: PreviewInfo | null;
  isLoading: boolean;
  error: string | null;
  iframeKey: number;
  onRefresh: () => void;
  port: number;
  onPortChange: (port: number) => void;
  pathStorageKey: string;
  /**
   * When set (sessions), Preview path is sticky on Convex. `undefined` while
   * the session query loads — falls back to sessionStorage until then.
   */
  stickyPath?: string;
  onStickyPathChange?: (path: string) => void;
  /** When set (sessions), Preview empty state shows a Wake up Eva button. */
  onStartSandbox?: () => void;
  isSandboxStarting?: boolean;
  /**
   * Session-only: submit compact display + rich agent prompt for a preview
   * annotation. When absent, the select-element toggle is hidden.
   */
  onAnnotationSubmit?: (display: string, full: string) => Promise<void>;
  /**
   * Session-only, set while this pane is the visible preview: lets it float
   * into the mini-player when the user leaves the sessions area or pops it out.
   */
  miniPlayer?: {
    sessionId: Id<"sessions">;
    returnTo: string;
    title: string;
  };
}

export function WebPreviewPanel({
  isActive,
  sandboxId,
  previewInfo,
  isLoading,
  error,
  iframeKey,
  onRefresh,
  port,
  onPortChange,
  pathStorageKey,
  stickyPath,
  onStickyPathChange,
  onStartSandbox,
  isSandboxStarting = false,
  onAnnotationSubmit,
  miniPlayer,
}: WebPreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  // The mini-player is a desktop affordance: on a phone there is no "beside".
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const floating = usePreviewMiniPlayer();
  const isFloating = floating?.entryKey === pathStorageKey;
  const miniPlayerSource =
    miniPlayer !== undefined && isDesktop && sandboxId !== undefined
      ? { ...miniPlayer, sandboxId }
      : undefined;
  // The live iframe lives in the global PreviewIframeHost (fixed overlay),
  // so it survives route changes. Nav bar / annotation consumers get the
  // element via this subscription instead of an in-tree ref.
  const iframeElement = usePreviewIframeElement(pathStorageKey);
  const fullscreenElement = useFullscreenElement();
  const [fullscreenRequested, setFullscreenRequested] = useState(false);
  // Esc exits fullscreen without going through our toggle — resync in render.
  if (fullscreenRequested && fullscreenElement === null) {
    setFullscreenRequested(false);
  }
  // `containerRef.requestFullscreen` would blank the preview: fixed-position
  // elements outside the fullscreen element (the host overlay) are not
  // rendered. Fullscreen the document instead and fake-expand this panel.
  const isFullscreen =
    fullscreenRequested && fullscreenElement === document.documentElement;
  const toggleFullscreen = () => {
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen();
      setFullscreenRequested(false);
      return;
    }
    void document.documentElement.requestFullscreen();
    setFullscreenRequested(true);
  };
  const [localPath, setLocalPath] = useSessionStorage(pathStorageKey, "/", {
    serializer: (value) => value,
    deserializer: (value) => normalizePreviewPath(value),
  });
  const viewportStorageKey = `${pathStorageKey}:viewport`;
  const [viewport, setViewport] = useSessionStorage<PreviewViewport>(
    viewportStorageKey,
    readStoredPreviewViewport(viewportStorageKey, `${pathStorageKey}:device`),
    {
      serializer: serializePreviewViewport,
      deserializer: parsePreviewViewport,
    },
  );
  const [aspectKey, setAspectKey] = useState(pathStorageKey);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  if (aspectKey !== pathStorageKey) {
    setAspectKey(pathStorageKey);
    setAspectRatio(null);
  }
  const containStorageKey = `${pathStorageKey}:contain`;
  const [contain, setContain] = useSessionStorage(containStorageKey, false, {
    serializer: (value) => (value ? "1" : "0"),
    deserializer: (value) => value === "1",
  });
  const containSizeStorageKey = `${pathStorageKey}:contain-size`;
  const [containSize, setContainSize] = useSessionStorage(
    containSizeStorageKey,
    { width: 1280, height: 800 },
    {
      serializer: serializePreviewContainSize,
      deserializer: parsePreviewContainSize,
    },
  );
  const framedViewport: PreviewViewport = framedPreviewViewport(
    viewport,
    contain,
    containSize,
  );
  const previewPath = normalizePreviewPath(stickyPath ?? localPath);

  // iframeSrc is recomputed only at remount points (previewInfo change,
  // storage-key change, or iframeKey bump from a refresh). previewPath is
  // intentionally NOT part of the key so the src stays stable while the user
  // navigates inside the iframe — otherwise we'd fight the iframe with
  // declarative src updates. Render-phase state adjustment, not useMemo.
  const srcKey = `${previewInfo?.url ?? ""}|${pathStorageKey}|${iframeKey}`;
  const [srcState, setSrcState] = useState<{
    key: string;
    src: string | undefined;
  }>(() => ({
    key: srcKey,
    src: previewInfo
      ? buildUrlWithPath(previewInfo.url, previewPath)
      : undefined,
  }));
  let iframeSrc = srcState.src;
  if (srcState.key !== srcKey) {
    iframeSrc = previewInfo
      ? buildUrlWithPath(previewInfo.url, previewPath)
      : undefined;
    setSrcState({ key: srcKey, src: iframeSrc });
  }

  function handlePathChange(path: string) {
    const next = normalizePreviewPath(path);
    setLocalPath(next);
    onStickyPathChange?.(next);
  }

  if (!isActive || !sandboxId) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <IconWorld className="w-12 h-12 opacity-50" />
          <p className="text-sm">
            {!isActive
              ? "Wake Eva up to preview your app"
              : "Waiting for sandbox..."}
          </p>
          {!isActive && onStartSandbox ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={onStartSandbox}
              disabled={isSandboxStarting}
            >
              <IconPlayerPlay size={14} />
              {isSandboxStarting ? "Starting..." : "Wake up Eva"}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  function applyFraming(next: PreviewFramingChange) {
    setViewport(next.viewport);
    setContain(next.contain);
    setContainSize(next.containSize);
    if (next.resetAspectRatio) setAspectRatio(null);
  }

  function handleToggleDevice() {
    const rect = iframeElement?.getBoundingClientRect();
    applyFraming(
      togglePreviewDevice(
        { viewport, contain, containSize },
        rect ? { width: rect.width, height: rect.height } : null,
      ),
    );
  }

  function handleToggleContain() {
    applyFraming(togglePreviewContain({ viewport, contain, containSize }));
  }

  // Manual pop-out: the pane hands its anchor to the mini-player and shows a
  // placeholder until the preview comes back (one anchor per hosted iframe).
  const popOut =
    miniPlayerSource !== undefined && iframeSrc !== undefined
      ? {
          active: isFloating,
          onToggle: () => {
            if (isFloating) {
              closePreviewMiniPlayer();
              return;
            }
            const fillBox = iframeElement?.getBoundingClientRect();
            openPreviewMiniPlayer({
              ...miniPlayerSource,
              entryKey: pathStorageKey,
              group: `${sandboxId}:${port}`,
              src: iframeSrc,
              epoch: iframeKey,
              mode: "manual",
              logicalSize: resolveMiniPlayerLogicalSize(
                framedViewport.mode === "fill"
                  ? null
                  : {
                      width: framedViewport.width,
                      height: framedViewport.height,
                    },
                fillBox
                  ? { width: fillBox.width, height: fillBox.height }
                  : null,
              ),
            });
          },
        }
      : undefined;
  const showPlaceholder = isFloating && floating.mode === "manual";

  return (
    <WebPreview
      ref={containerRef}
      defaultUrl={iframeSrc ?? ""}
      className={cn(
        "h-full rounded-none border-0",
        isFullscreen && "fixed inset-0 z-40 h-auto bg-background",
      )}
    >
      <PreviewPanelNavBar
        previewInfo={previewInfo}
        isLoading={isLoading}
        onRefresh={onRefresh}
        containerRef={containerRef}
        iframeElement={iframeElement}
        onToggleFullscreen={toggleFullscreen}
        port={port}
        onPortChange={onPortChange}
        previewPath={previewPath}
        onPathChange={handlePathChange}
        viewport={viewport}
        onToggleDevice={handleToggleDevice}
        contain={contain}
        onToggleContain={handleToggleContain}
        annotationMode={annotationMode}
        onAnnotationModeChange={setAnnotationMode}
        showAnnotationToggle={Boolean(onAnnotationSubmit)}
        popOut={popOut}
      />
      {!showPlaceholder && viewport.mode !== "fill" ? (
        <PreviewDeviceToolbar
          viewport={viewport}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          onChange={setViewport}
          onFill={() => {
            setViewport(FILL_PREVIEW_VIEWPORT);
            setAspectRatio(null);
            setContain(false);
          }}
        />
      ) : null}
      {showPlaceholder ? (
        <PreviewFloatingPlaceholder />
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <PreviewViewportFrame
            viewport={framedViewport}
            aspectRatio={aspectRatio}
            onResize={(size) => {
              if (viewport.mode === "fill" && contain) {
                setContainSize(size);
                return;
              }
              setViewport({
                mode: "freeform",
                width: size.width,
                height: size.height,
              });
            }}
          >
            <PersistentPreviewBody
              entryKey={pathStorageKey}
              group={`${sandboxId}:${port}`}
              src={iframeSrc}
              epoch={iframeKey}
              covered={error !== null}
              miniPlayer={miniPlayerSource}
              logicalSize={
                framedViewport.mode === "fill"
                  ? null
                  : {
                      width: framedViewport.width,
                      height: framedViewport.height,
                    }
              }
              loading={
                isLoading && !previewInfo ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-secondary">
                    <Spinner size="lg" />
                  </div>
                ) : error ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button size="sm" variant="secondary" onClick={onRefresh}>
                      <IconRefresh className="w-4 h-4" />
                      Retry
                    </Button>
                  </div>
                ) : undefined
              }
            />
          </PreviewViewportFrame>
          {onAnnotationSubmit ? (
            <PreviewAnnotationLayer
              mode={annotationMode}
              onModeChange={setAnnotationMode}
              onSubmit={onAnnotationSubmit}
            />
          ) : null}
        </div>
      )}
    </WebPreview>
  );
}
