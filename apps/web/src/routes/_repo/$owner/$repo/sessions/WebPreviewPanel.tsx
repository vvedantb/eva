import { useRef, useState } from "react";
import { cn } from "@eva/ui";
import { Spinner, Button, WebPreview, useMediaQuery } from "@vvedantb/ui";
import { useSessionStorage } from "usehooks-ts";
import { SandboxAsleepState } from "@/lib/components/sandbox/SandboxAsleepState";
import { IconRefresh, IconWorld } from "@tabler/icons-react";
import {
  buildUrlWithPath,
  normalizePreviewPath,
  type PreviewPortOption,
} from "@/lib/components/PreviewNavBar";
import {
  PersistentPreviewBody,
  useFullscreenElement,
  usePreviewIframeElement,
} from "@/lib/components/sandbox/previewIframeHost";
import {
  PreviewToolCallExecutor,
  type PreviewToolCallParentId,
} from "@/lib/components/sandbox/PreviewToolCallExecutor";
import { resolveMiniPlayerLogicalSize } from "@/lib/components/sandbox/previewContain";
import {
  closePreviewMiniPlayer,
  openPreviewMiniPlayer,
  usePreviewMiniPlayer,
  type PreviewMiniPlayerSource,
} from "@/lib/components/sandbox/previewMiniPlayerStore";
import type { PreviewAnnotationTarget } from "@/lib/components/sandbox/annotationSend";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useQueryState } from "nuqs";
import { api, type Id } from "@eva/backend";
import { messageLinkParser } from "@/lib/search-params";
import { MESSAGE_LINK_PARAM } from "@eva/shared/messageLink";
import { usePreviewScreenshot } from "./_components/usePreviewScreenshot";
import { usePreviewToolbarBridge } from "./_components/usePreviewToolbarBridge";
import { PreviewAnnotationLayer } from "./_components/PreviewAnnotationLayer";
import {
  PreviewCommentsDrawer,
  isResolved,
} from "./_components/PreviewCommentsDrawer";
import { PreviewSketchLayer } from "./_components/PreviewSketchLayer";
import { usePendingPreviewSnapshots } from "@/lib/contexts/PendingPreviewSnapshotsContext";
import { usePublishPreviewViewport } from "@/lib/contexts/PreviewViewportContext";
import { PreviewDeviceToolbar } from "./_components/PreviewDeviceToolbar";
import { PreviewFloatingPlaceholder } from "./_components/PreviewFloatingPlaceholder";
import { PreviewPanelNavBar } from "./_components/PreviewPanelNavBar";
import { PreviewViewportFrame } from "./_components/PreviewViewportFrame";
import {
  FILL_PREVIEW_VIEWPORT,
  findPreviewViewportPreset,
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
  /** Multi-repo sessions: one dev-server port per checked-out repo. */
  portOptions?: readonly PreviewPortOption[];
  /**
   * Per-pane identity: hosted iframe key and sessionStorage prefix for the
   * device viewport. The path itself lives on Convex (`path`).
   */
  pathStorageKey: string;
  /** The chat that owns this sandbox: agent page-tool calls are queued on it. */
  toolCallParentId: PreviewToolCallParentId;
  /**
   * This pane's sticky Preview path from Convex. `undefined` while the view
   * state loads: the iframe waits so it never opens at the wrong path.
   */
  path: string | undefined;
  onPathChange: (path: string) => void;
  /** When set (sessions), Preview empty state shows a Wake up Eva button. */
  onStartSandbox?: () => void;
  isSandboxStarting?: boolean;
  /**
   * The owner chat's preview annotations: Select element sends into it, the
   * Comments drawer lists it. When absent, both tools are hidden.
   */
  annotation?: PreviewAnnotationTarget;
  /**
   * Set while this pane is the visible preview: lets it float into the
   * mini-player when the user leaves the preview or pops it out.
   */
  miniPlayer?: Omit<PreviewMiniPlayerSource, "sandboxId">;
  /** Idle pause on: Eva wake link for "Open in new tab" (see PreviewNavBar). */
  externalHrefForPath?: (path: string) => string;
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
  portOptions,
  pathStorageKey,
  toolCallParentId,
  path,
  onPathChange,
  onStartSandbox,
  isSandboxStarting = false,
  annotation,
  miniPlayer,
  externalHrefForPath,
}: WebPreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // One subscription per chat: every pane of it shares the cached result.
  // Skipped while the sandbox is asleep: the toolbar is not on screen then.
  const comments =
    useQuery(
      api.previewComments.list,
      isActive && annotation?.chatId ? { chatId: annotation.chatId } : "skip",
    ) ?? [];
  const [linkedMessageId, setLinkedMessageId] = useQueryState(
    MESSAGE_LINK_PARAM,
    messageLinkParser,
  );
  const [sketchMode, setSketchMode] = useState(false);
  // Sketch hands its image to a composer through this context; without one
  // there is nowhere for it to go.
  const canSketch = usePendingPreviewSnapshots() !== undefined;
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
  const screenshot = usePreviewScreenshot(iframeElement);
  // The toolbar is drawn inside the page by the preview proxy; this hands it
  // Eva's state and runs the tools that need Eva.
  usePreviewToolbarBridge({
    iframeElement,
    state: {
      selectEnabled: annotation !== undefined,
      commentsEnabled: annotation !== undefined,
      commentsActive: commentsOpen,
      // Open only: a resolved comment needs nothing more.
      commentCount: comments.filter((comment) => !isResolved(comment)).length,
      sketchEnabled: canSketch,
      sketchActive: sketchMode,
    },
    actions: {
      select: () => setAnnotationMode(!annotationMode),
      comments: () => setCommentsOpen(!commentsOpen),
      sketch: () => {
        setSketchMode(!sketchMode);
        // One tool at a time: both read pointer input on the page.
        setAnnotationMode(false);
      },
      screenshot: screenshot.capture,
    },
  });
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
  // The agent hears the size of a custom frame with every message.
  usePublishPreviewViewport(
    isActive && framedViewport.mode !== "fill"
      ? {
          width: framedViewport.width,
          height: framedViewport.height,
          label:
            framedViewport.mode === "preset"
              ? findPreviewViewportPreset(framedViewport.id)?.label
              : undefined,
        }
      : null,
  );
  const pathLoaded = path !== undefined;
  const previewPath = normalizePreviewPath(path ?? "/");

  // iframeSrc is recomputed only at remount points (previewInfo change,
  // storage-key change, path first loaded, or iframeKey bump from a refresh).
  // previewPath is intentionally NOT part of the key so the src stays stable
  // while the user navigates inside the iframe — otherwise we'd fight the
  // iframe with declarative src updates. Render-phase state adjustment, not
  // useMemo.
  const srcKey = `${previewInfo?.url ?? ""}|${pathStorageKey}|${iframeKey}|${pathLoaded}`;
  const buildSrc = () =>
    previewInfo && pathLoaded
      ? buildUrlWithPath(previewInfo.url, previewPath)
      : undefined;
  const [srcState, setSrcState] = useState<{
    key: string;
    src: string | undefined;
  }>(() => ({ key: srcKey, src: buildSrc() }));
  let iframeSrc = srcState.src;
  if (srcState.key !== srcKey) {
    iframeSrc = buildSrc();
    setSrcState({ key: srcKey, src: iframeSrc });
  }

  function handlePathChange(next: string) {
    onPathChange(normalizePreviewPath(next));
  }

  // The chat follows `?message=` (scroll + flash). Fullscreen hides the chat,
  // so leave it first. Re-linking the same row clears the param once so the
  // chat scrolls to it again.
  function viewInChat(messageId: Id<"messages">) {
    if (isFullscreen) toggleFullscreen();
    if (linkedMessageId === messageId) {
      void setLinkedMessageId(null).then(() => setLinkedMessageId(messageId));
      return;
    }
    void setLinkedMessageId(messageId);
  }

  if (!isActive || !sandboxId) {
    return (
      <SandboxAsleepState
        icon={IconWorld}
        label={
          !isActive
            ? "Wake Eva up to preview your app"
            : "Waiting for sandbox..."
        }
        wake={!isActive ? { onStartSandbox, isSandboxStarting } : undefined}
      />
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
        portOptions={portOptions}
        externalHrefForPath={externalHrefForPath}
        previewPath={previewPath}
        onPathChange={handlePathChange}
        viewport={viewport}
        onToggleDevice={handleToggleDevice}
        contain={contain}
        onToggleContain={handleToggleContain}
        popOut={popOut}
      />
      <PreviewToolCallExecutor
        parentId={toolCallParentId}
        iframeElement={iframeElement}
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
          {sketchMode ? (
            <PreviewSketchLayer
              iframeElement={iframeElement}
              onClose={() => setSketchMode(false)}
            />
          ) : null}
          {annotation ? (
            <PreviewAnnotationLayer
              mode={annotationMode}
              onModeChange={setAnnotationMode}
              onSubmit={annotation.submit}
            />
          ) : null}
          {/* The floating mini-player takes the iframe; the drawer stays
              behind with the pane instead of covering the small player. */}
          {annotation && commentsOpen && !sketchMode && !isFloating ? (
            <PreviewCommentsDrawer
              iframeElement={iframeElement}
              comments={comments}
              previewPath={previewPath}
              onViewInChat={viewInChat}
              onClose={() => setCommentsOpen(false)}
            />
          ) : null}
        </div>
      )}
    </WebPreview>
  );
}
