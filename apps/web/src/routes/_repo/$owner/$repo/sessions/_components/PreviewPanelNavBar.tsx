"use client";

import type { ReactNode, RefObject } from "react";
import { cn } from "@eva/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  WebPreviewNavigation,
  useWebPreview,
} from "@vvedantb/ui";
import {
  IconAspectRatio,
  IconCheck,
  IconDevices,
  IconDotsVertical,
  IconListTree,
  IconPictureInPicture,
  IconPlug,
} from "@tabler/icons-react";
import {
  PreviewNavBar,
  normalizePreviewPath,
  type PreviewPortOption,
} from "@/lib/components/PreviewNavBar";
import { usePreviewSnapshot } from "@/lib/components/sandbox/PreviewSnapshotButton";
import { usePreviewWebMcp } from "@/lib/components/sandbox/PreviewWebMcpButton";
import type { PreviewViewport } from "../_utils/previewViewport";

interface PreviewInfo {
  url: string;
  port: number;
}

export function PreviewPanelNavBar({
  previewInfo,
  isLoading,
  onRefresh,
  containerRef,
  iframeElement,
  onToggleFullscreen,
  port,
  onPortChange,
  portOptions,
  previewPath,
  onPathChange,
  viewport,
  onToggleDevice,
  contain,
  onToggleContain,
  popOut,
  externalHrefForPath,
}: {
  previewInfo: PreviewInfo | null;
  isLoading: boolean;
  onRefresh: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  iframeElement?: HTMLIFrameElement | null;
  onToggleFullscreen?: () => void;
  port: number;
  onPortChange: (port: number) => void;
  /** Multi-repo sessions: one dev-server port per checked-out repo. */
  portOptions?: readonly PreviewPortOption[];
  previewPath: string;
  onPathChange: (path: string) => void;
  viewport: PreviewViewport;
  onToggleDevice: () => void;
  /** Letterbox a locked viewport instead of filling the pane (responsive). */
  contain: boolean;
  onToggleContain: () => void;
  /** Sessions and quick tasks on desktop only: toggles the floating mini-player. */
  popOut?: { active: boolean; onToggle: () => void };
  /** Idle pause on: Eva wake link for "Open in new tab" (see PreviewNavBar). */
  externalHrefForPath?: (path: string) => string;
}) {
  const { iframeRef } = useWebPreview();
  const frame = iframeElement ?? null;
  const snapshot = usePreviewSnapshot({ iframeElement: frame });
  const webMcp = usePreviewWebMcp({ iframeElement: frame });
  const deviceActive = viewport.mode !== "fill";
  const containActive = contain || deviceActive;
  const busy = snapshot.capturing || webMcp.discovering;
  // The menu hides these modes, so the trigger carries their "on" state.
  const anyModeActive =
    deviceActive ||
    containActive ||
    popOut?.active === true;

  const toolsMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "h-8 w-8 shrink-0 p-0 hover:text-foreground max-sm:hit-target",
            anyModeActive && "bg-secondary text-primary hover:text-primary",
          )}
          aria-label="Preview tools"
          data-testid="preview-tools-menu"
        >
          {busy ? (
            <Spinner size="sm" />
          ) : (
            <IconDotsVertical className="size-3.5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <PreviewToolItem
          icon={<IconDevices className="size-3.5" />}
          label="Show device toolbar"
          active={deviceActive}
          onSelect={onToggleDevice}
        />
        <PreviewToolItem
          icon={<IconAspectRatio className="size-3.5" />}
          label="Contain aspect ratio"
          active={containActive}
          onSelect={onToggleContain}
        />
        {popOut ? (
          <PreviewToolItem
            icon={<IconPictureInPicture className="size-3.5" />}
            label="Pop out preview"
            active={popOut.active}
            onSelect={popOut.onToggle}
          />
        ) : null}
        <PreviewToolItem
          icon={<IconListTree className="size-3.5" />}
          label="Semantic snapshot"
          disabled={snapshot.disabled}
          onSelect={snapshot.capture}
        />
        <PreviewToolItem
          icon={<IconPlug className="size-3.5" />}
          label="Page tools"
          disabled={webMcp.disabled}
          onSelect={webMcp.discover}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <WebPreviewNavigation className="max-sm:flex-wrap gap-1">
      <PreviewNavBar
        previewUrl={previewInfo?.url ?? null}
        iframeRef={iframeRef}
        iframeElement={iframeElement}
        containerRef={containerRef}
        onToggleFullscreen={onToggleFullscreen}
        port={port}
        path={previewPath}
        onPortChange={onPortChange}
        portOptions={portOptions}
        onPathChange={(path) => onPathChange(normalizePreviewPath(path))}
        isLoading={isLoading}
        onRefresh={onRefresh}
        trailing={toolsMenu}
        externalHrefForPath={externalHrefForPath}
      />
      {snapshot.dialog}
      {webMcp.dialog}
    </WebPreviewNavigation>
  );
}

function PreviewToolItem({
  icon,
  label,
  active,
  disabled,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  /** Toggles show a check while on; one-shot actions omit it. */
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={onSelect}
      aria-checked={active}
      role={active === undefined ? "menuitem" : "menuitemcheckbox"}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? (
        <IconCheck className="ml-auto size-3.5 shrink-0 text-primary" />
      ) : null}
    </DropdownMenuItem>
  );
}
