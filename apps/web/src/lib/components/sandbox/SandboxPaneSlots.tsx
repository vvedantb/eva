"use client";

import { useQuery } from "convex/react";
import { api, type Doc, type Id, type SandboxOwner } from "@eva/backend";
import { cn } from "@eva/ui";
import { previewWakePath } from "@eva/shared";
import { slugifyAppTabName } from "@/lib/utils/appTabSlug";
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
import { sandboxOwnerParentId } from "./PreviewToolCallExecutor";
import type { SandboxPanesApi } from "./useSandboxPanes";
import type { SandboxPreviewApi } from "./useSandboxPreview";
import {
  isSimpleViewHiddenSandboxTab,
  useSimpleView,
} from "@/lib/hooks/useSimpleView";

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
  /** Session-only: preview select-element → chat submit. */
  onAnnotationSubmit?: (display: string, full: string) => Promise<void>;
  /** Session-only: the visible preview may float into the mini-player. */
  miniPlayer?: { sessionId: Id<"sessions">; returnTo: string; title: string };
  /**
   * Multi-repo sessions: the dev-server port of each checked-out repo, offered
   * beside the Preview port input. Omitted for a single-repo surface.
   */
  previewPortOptions?: readonly PreviewPortOption[];
  /** Session sticky Preview path from Convex. */
  stickyPreviewPath?: string;
  onStickyPreviewPathChange?: (path: string) => void;
  /**
   * Session sticky console history: seed + debounced persist of last ~500 lines.
   * Only wired for the Preview Console pane.
   */
  stickyTerminalHistoryTail?: string;
  onStickyTerminalHistoryTailChange?: (tail: string) => void;
  /**
   * Whether this host is the one on screen. Sessions keep up to three shells
   * mounted and every host may collapse its rail; only a visible host may hold the
   * idle-pause presence beacon or auto-wake. Defaults to true.
   */
  presenceEnabled?: boolean;
  /**
   * The sandbox is closed and the host would allow a Start: no last-start
   * error, not read-only, no run or build owning it. Combined
   * here with the setting and tab visibility to auto-wake.
   */
  autoWakeEligible?: boolean;
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
  stickyPreviewPath,
  onStickyPreviewPathChange,
  stickyTerminalHistoryTail,
  onStickyTerminalHistoryTailChange,
  presenceEnabled = true,
  autoWakeEligible,
}: SandboxPaneSlotsProps) {
  const simpleView = useSimpleView();
  const resolvedTab =
    simpleView && isSimpleViewHiddenSandboxTab(activeTab)
      ? "preview"
      : activeTab;
  const entityId = sandboxOwnerParentId(owner);
  // Idle pause: a VM tab in the foreground keeps the sandbox awake (presence
  // beacon, always on). With the setting fully on, the same visible tab wakes
  // a paused sandbox, and the external links become Eva wake links so they
  // outlive a pause.
  const currentUserId = useQuery(api.auth.me);
  const idlePause = useQuery(api.sandboxIdlePause.getSandboxIdlePauseSettings);
  const beaconActive =
    presenceEnabled &&
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
        {previewIds.map((id) => (
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
              stickyPath={stickyPreviewPath}
              onStickyPathChange={onStickyPreviewPathChange}
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
                      stickyHistoryTail={stickyTerminalHistoryTail}
                      onStickyHistoryTailChange={
                        onStickyTerminalHistoryTailChange
                      }
                    />
                  </div>
                ) : null
              }
            />
          )}
        </SandboxPaneBoundary>
      </div>
      <div className={resolvedTab === "editor" ? "h-full" : "hidden"}>
        <SandboxPaneBoundary label="Editor">
          <EditorPanel
            cacheKey={cacheKey}
            sandboxId={sandboxId}
            isActive={isActive}
            repoId={repoId}
            externalHref={wakeHrefForPath?.("/", 8080)}
          />
        </SandboxPaneBoundary>
      </div>
      <div
        className={
          resolvedTab === "browser" || resolvedTab === "computer"
            ? "h-full"
            : "hidden"
        }
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
            externalHref={wakeHrefForPath?.("/", 6080)}
          />
        </SandboxPaneBoundary>
      </div>
      <div className={resolvedTab === "review" ? "h-full" : "hidden"}>
        <SandboxPaneBoundary label="Review">
          <PrPanel
            prUrl={prUrl}
            repoId={repoId}
            isActive={resolvedTab === "review"}
          />
        </SandboxPaneBoundary>
      </div>
      {simpleView
        ? null
        : customTabs?.map((tab) => {
            const slug = slugifyAppTabName(tab.name);
            return (
              <div
                key={tab._id}
                className={resolvedTab === slug ? "h-full" : "hidden"}
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
                  />
                </SandboxPaneBoundary>
              </div>
            );
          })}
    </>
  );
}
