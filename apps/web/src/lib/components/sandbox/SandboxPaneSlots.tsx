"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api, type Doc, type Id, type SandboxOwner } from "@eva/backend";
import { cn } from "@eva/ui";
import { DESKTOP_PORT, EDITOR_PORT, previewWakePath } from "@eva/shared";
import { slugifyAppTabName } from "@eva/shared/appTabSlug";
import { isSandboxVmTab } from "@/lib/search-params";
import { SandboxPresenceBeacon } from "./SandboxPresenceBeacon";
import { SandboxAutoWake } from "./SandboxAutoWake";
import type { PreviewPortOption } from "@/lib/components/PreviewNavBar";
import { CustomTabPanel } from "./CustomTabPanel";
import { TerminalPanel } from "@/routes/_repo/$owner/$repo/sessions/TerminalPanel";
import { WebPreviewPanel } from "@/routes/_repo/$owner/$repo/sessions/WebPreviewPanel";
import { EditorPanel } from "@/routes/_repo/$owner/$repo/sessions/EditorPanel";
import { DesktopPanel } from "@/routes/_repo/$owner/$repo/sessions/DesktopPanel";
import { PrPanel } from "./PrPanel";
import { SandboxPaneBoundary } from "./SandboxPaneBoundary";
import { PreviewPaneTabs } from "@/routes/_repo/$owner/$repo/sessions/_components/PreviewPaneTabs";
import { ConsoleDock } from "./ConsoleDock";
import { KeepAlivePane } from "./KeepAlivePane";
import { sandboxOwnerParentId } from "./PreviewToolCallExecutor";
import type { SandboxPanesApi } from "./useSandboxPanes";
import type { SandboxPreviewApi } from "./useSandboxPreview";
import type { PreviewMiniPlayerSource } from "./previewMiniPlayerStore";
import type { AnnotationSubmit } from "./annotationSend";
import {
  isSimpleViewHiddenSandboxTab,
  useSimpleView,
} from "@/lib/hooks/useSimpleView";
import { useUserEngaged } from "@/lib/hooks/useUserEngaged";

interface SandboxPaneSlotsProps {
  /** Builtin tab id (SandboxTab) or a custom tab's name slug. */
  activeTab: string;
  panes: SandboxPanesApi;
  preview: SandboxPreviewApi;
  owner: SandboxOwner;
  sandboxId: string | undefined;
  isActive: boolean;
  repoId: Id<"githubRepos">;
  /** sessionStorage cache namespace for editor / desktop URL caches. */
  cacheKey: string;
  devCommand?: string;
  /** PR URL for the PR tab; absent when no PR exists for this surface. */
  prUrl?: string;
  /** User-defined tabs for this app; expected pre-filtered to enabled ones. */
  customTabs?: ReadonlyArray<Doc<"appTabs">>;
  agentBrowsingAt?: number;
  /**
   * Clears the agent-browsing soft lock for this owner (session/task/project
   * mutation, provided by the caller). Takeover overlay only renders when set.
   */
  onReleaseBrowserLock?: () => void;
  /**
   * When false, the Preview Console does not auto-type the start command
   * (session sandboxes start it in tmux from the backend after startup).
   * Defaults to true for tasks/projects.
   */
  runConsoleDevCommandOnConnect?: boolean;
  /** Preview empty state Start button when sandbox is stopped. */
  onStartSandbox?: () => void;
  isSandboxStarting?: boolean;
  /*
   * Preview tools every surface must wire (session, quick task, project).
   * Required on purpose: an optional prop here let one surface silently lose
   * menu items. Add a new preview tool as a required prop too.
   */
  /** Preview select-element → owner chat submit. */
  onAnnotationSubmit: AnnotationSubmit;
  /**
   * The visible preview may float into the mini-player. `undefined` only
   * while this pane is not on screen (collapsed rail, cached sibling).
   */
  miniPlayer: Omit<PreviewMiniPlayerSource, "sandboxId"> | undefined;
  /**
   * Multi-repo sessions: the dev-server port of each checked-out repo, offered
   * beside the Preview port input. Omitted for a single-repo surface.
   */
  previewPortOptions?: readonly PreviewPortOption[];
  /**
   * The owner's sticky view state (`sandboxPanes.getViewState`); `undefined`
   * while it loads. Owns each preview pane's path and the console tail.
   */
  viewState: SandboxViewState | undefined;
  /**
   * Whether this host is the one on screen. Sessions keep up to three shells
   * mounted and every host may collapse its rail; only a visible host may hold the
   * idle-pause presence beacon or auto-wake. Defaults to true.
   */
  presenceEnabled?: boolean;
  /**
   * False while this host sits hidden in the session cache. Iframe tabs
   * (Editor, Browser, custom tabs) unmount then to free their browser
   * processes; they reload when the session is shown again. Defaults to true.
   */
  onScreen?: boolean;
  /**
   * The sandbox is closed and the host would allow a Start: no last-start
   * error, not read-only, no run or build owning it. Combined
   * here with the setting and recent input on a visible tab to auto-wake.
   */
  autoWakeEligible?: boolean;
}

export type SandboxViewState = FunctionReturnType<
  typeof api.sandboxPanes.getViewState
>;

/**
 * One preview pane's sticky path: the main pane (no `paneId`) reads the
 * owner's `previewPath`, an extra pane its own entry. `undefined` while the
 * view state loads, so the iframe waits instead of loading the wrong path.
 */
function previewPanePath(
  viewState: SandboxViewState | undefined,
  paneId: string | undefined,
): string | undefined {
  if (viewState === undefined) return undefined;
  const path =
    paneId === undefined
      ? viewState?.previewPath
      : viewState?.previewPanePaths?.find((entry) => entry.paneId === paneId)
          ?.path;
  return path ?? "/";
}

/** Optimistic copy of `sandboxPanes.setPreviewPath` for the local cache. */
function withPreviewPanePath(
  viewState: NonNullable<SandboxViewState>,
  paneId: string | undefined,
  path: string,
): NonNullable<SandboxViewState> {
  if (paneId === undefined) return { ...viewState, previewPath: path };
  const others = (viewState.previewPanePaths ?? []).filter(
    (entry) => entry.paneId !== paneId,
  );
  return { ...viewState, previewPanePaths: [...others, { paneId, path }] };
}

/**
 * Renders the standard sandbox tab slots (preview, editor, desktop,
 * Review) as a fragment. Callers wrap this in their own flex container and may
 * add their own slots alongside (e.g. session PRD slot).
 */
export function SandboxPaneSlots({
  activeTab,
  panes,
  preview,
  owner,
  sandboxId,
  isActive,
  repoId,
  cacheKey,
  devCommand,
  prUrl,
  customTabs,
  agentBrowsingAt,
  onReleaseBrowserLock,
  runConsoleDevCommandOnConnect = true,
  onStartSandbox,
  isSandboxStarting,
  onAnnotationSubmit,
  miniPlayer,
  previewPortOptions,
  viewState,
  presenceEnabled = true,
  onScreen = true,
  autoWakeEligible,
}: SandboxPaneSlotsProps) {
  const simpleView = useSimpleView();
  const wake = { onStartSandbox, isSandboxStarting };
  const resolvedTab =
    simpleView && isSimpleViewHiddenSandboxTab(activeTab)
      ? "preview"
      : activeTab;
  const entityId = sandboxOwnerParentId(owner);
  // Idle pause: a VM tab in the foreground AND in use keeps the sandbox awake
  // (presence beacon, always on). With the setting fully on, the same tab
  // wakes a paused sandbox, and the external links become Eva wake links so
  // they outlive a pause. "In use" (recent input) stops an unattended visible
  // tab from holding or re-waking the sandbox indefinitely.
  const currentUserId = useQuery(api.auth.me);
  const idlePause = useQuery(api.sandboxIdlePause.getSandboxIdlePauseSettings);
  const engaged = useUserEngaged();
  const setPreviewPath = useMutation(
    api.sandboxPanes.setPreviewPath,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.sandboxPanes.getViewState, {
      owner: args.owner,
    });
    if (!current) return;
    localStore.setQuery(
      api.sandboxPanes.getViewState,
      { owner: args.owner },
      withPreviewPanePath(current, args.paneId, args.path),
    );
  });
  const setTerminalHistoryTail = useMutation(
    api.sandboxPanes.setTerminalHistoryTail,
  );
  const beaconActive =
    presenceEnabled &&
    engaged &&
    isActive &&
    isSandboxVmTab(resolvedTab) &&
    currentUserId !== undefined &&
    currentUserId !== null;
  const wakeHrefForPath =
    idlePause?.mode === "on"
      ? (path: string, port?: number) =>
          `${window.location.origin}${previewWakePath({ kind: owner.kind, id: String(entityId), port, path })}`
      : undefined;
  const {
    previewIds,
    consolePane,
    resolvedPreviewActive,
    setPreviewActive,
    handleClosePreview,
  } = panes;

  // Keep Preview chrome + iframes mounted while the Preview tab is hidden so
  // switching away (Editor / Review / …) does not remount the running app.
  const previewRegion = (
    <div className="flex h-full min-h-0 flex-col">
      <div className={resolvedTab === "preview" ? undefined : "hidden"}>
        <PreviewPaneTabs
          previewIds={previewIds}
          activeId={resolvedPreviewActive}
          onSelect={setPreviewActive}
          onClose={handleClosePreview}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {previewIds.length === 0 ? (
          <div
            className={
              resolvedTab === "preview"
                ? "flex flex-1 items-center justify-center text-sm text-muted-foreground"
                : "hidden"
            }
          >
            Preparing preview...
          </div>
        ) : null}
        {previewIds.map((id, index) => (
          <div
            key={id}
            className={cn(
              resolvedPreviewActive === id
                ? "flex min-h-0 flex-1 flex-col"
                : "hidden",
            )}
          >
            <WebPreviewPanel
              isActive={isActive}
              sandboxId={sandboxId}
              previewInfo={preview.previewInfo}
              isLoading={preview.isLoading}
              error={preview.error}
              iframeKey={preview.iframeKey}
              onRefresh={preview.reloadPreview}
              port={preview.effectivePort}
              onPortChange={preview.setPort}
              portOptions={previewPortOptions}
              pathStorageKey={[
                "eva",
                owner.kind,
                cacheKey,
                "preview-path",
                id,
                preview.effectivePort,
              ].join(":")}
              toolCallParentId={sandboxOwnerParentId(owner)}
              path={previewPanePath(viewState, index === 0 ? undefined : id)}
              onPathChange={(path) => {
                void setPreviewPath({
                  owner,
                  path,
                  // The first pane is the main pane: no paneId.
                  ...(index === 0 ? {} : { paneId: id }),
                });
              }}
              onStartSandbox={onStartSandbox}
              isSandboxStarting={isSandboxStarting}
              onAnnotationSubmit={onAnnotationSubmit}
              miniPlayer={
                resolvedTab === "preview" && resolvedPreviewActive === id
                  ? miniPlayer
                  : undefined
              }
              externalHrefForPath={
                wakeHrefForPath
                  ? (path) => wakeHrefForPath(path, preview.effectivePort)
                  : undefined
              }
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {beaconActive ? (
        <SandboxPresenceBeacon
          entityId={String(entityId)}
          userId={currentUserId}
        />
      ) : null}
      {idlePause?.mode === "on" &&
      autoWakeEligible &&
      presenceEnabled &&
      engaged &&
      !isActive &&
      !isSandboxStarting &&
      onStartSandbox &&
      isSandboxVmTab(resolvedTab) ? (
        <SandboxAutoWake wakeKey={String(entityId)} onWake={onStartSandbox} />
      ) : null}
      <div
        className={
          resolvedTab === "preview"
            ? "flex h-full min-h-0 flex-col overflow-hidden"
            : "hidden"
        }
      >
        <SandboxPaneBoundary label="Preview">
          {simpleView ? (
            previewRegion
          ) : (
            <ConsoleDock
              controller={panes.consoleDock}
              preview={previewRegion}
              renderConsole={(visible) =>
                consolePane ? (
                  <div className="flex h-full min-h-0 flex-col overflow-hidden">
                    <TerminalPanel
                      owner={owner}
                      sandboxId={sandboxId}
                      isActive={isActive}
                      ptyInstanceId={consolePane.id}
                      isForeground={resolvedTab === "preview" && visible}
                      runDevCommandOnConnect={runConsoleDevCommandOnConnect}
                      devCommand={devCommand}
                      stickyHistoryTail={
                        viewState === undefined
                          ? undefined
                          : (viewState?.terminalHistoryTail ?? "")
                      }
                      onStickyHistoryTailChange={(tail) => {
                        void setTerminalHistoryTail({ owner, tail });
                      }}
                    />
                  </div>
                ) : null
              }
            />
          )}
        </SandboxPaneBoundary>
      </div>
      <KeepAlivePane
        active={resolvedTab === "editor"}
        discard={!onScreen}
        className="h-full"
      >
        <SandboxPaneBoundary label="Editor">
          <EditorPanel
            cacheKey={cacheKey}
            sandboxId={sandboxId}
            isActive={isActive}
            repoId={repoId}
            externalHref={wakeHrefForPath?.("/", EDITOR_PORT)}
            wake={wake}
          />
        </SandboxPaneBoundary>
      </KeepAlivePane>
      <KeepAlivePane
        active={resolvedTab === "browser" || resolvedTab === "computer"}
        discard={!onScreen}
        className="h-full"
      >
        <SandboxPaneBoundary
          label={resolvedTab === "browser" ? "Browser" : "Computer"}
        >
          <DesktopPanel
            cacheKey={cacheKey}
            sandboxId={sandboxId}
            isActive={isActive}
            repoId={repoId}
            surface={resolvedTab === "browser" ? "browser" : "desktop"}
            agentBrowsingAt={agentBrowsingAt}
            onReleaseLock={onReleaseBrowserLock}
            externalHref={wakeHrefForPath?.("/", DESKTOP_PORT)}
            wake={wake}
          />
        </SandboxPaneBoundary>
      </KeepAlivePane>
      <KeepAlivePane active={resolvedTab === "review"} className="h-full">
        <SandboxPaneBoundary label="Review">
          <PrPanel
            owner={owner}
            prUrl={prUrl}
            repoId={repoId}
            isActive={resolvedTab === "review"}
          />
        </SandboxPaneBoundary>
      </KeepAlivePane>
      {simpleView
        ? null
        : customTabs?.map((tab) => {
            const slug = slugifyAppTabName(tab.name);
            return (
              <KeepAlivePane
                key={tab._id}
                active={resolvedTab === slug}
                discard={!onScreen}
                className="h-full"
              >
                <SandboxPaneBoundary label={tab.name}>
                  <CustomTabPanel
                    name={tab.name}
                    port={tab.port}
                    sandboxId={sandboxId}
                    isActive={isActive}
                    isForeground={resolvedTab === slug}
                    previewPort={preview.effectivePort}
                    repoId={repoId}
                    externalHref={wakeHrefForPath?.(
                      `/__tab/${tab.port}/`,
                      preview.effectivePort,
                    )}
                    wake={wake}
                  />
                </SandboxPaneBoundary>
              </KeepAlivePane>
            );
          })}
    </>
  );
}
