"use client";

import type { RefObject } from "react";
import {
  cn,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  useWebPreview,
} from "@eva/ui";
import {
  IconAspectRatio,
  IconClick,
  IconDevices,
  IconPictureInPicture,
} from "@tabler/icons-react";
import {
  PreviewNavBar,
  normalizePreviewPath,
} from "@/lib/components/PreviewNavBar";
import { PreviewScreenshotButton } from "./PreviewScreenshotButton";
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
  previewPath,
  onPathChange,
  viewport,
  onToggleDevice,
  contain,
  onToggleContain,
  annotationMode,
  onAnnotationModeChange,
  showAnnotationToggle,
  popOut,
}: {
  previewInfo: PreviewInfo | null;
  isLoading: boolean;
  onRefresh: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  iframeElement?: HTMLIFrameElement | null;
  onToggleFullscreen?: () => void;
  port: number;
  onPortChange: (port: number) => void;
  previewPath: string;
  onPathChange: (path: string) => void;
  viewport: PreviewViewport;
  onToggleDevice: () => void;
  /** Letterbox a locked viewport instead of filling the pane (responsive). */
  contain: boolean;
  onToggleContain: () => void;
  annotationMode: boolean;
  onAnnotationModeChange: (active: boolean) => void;
  showAnnotationToggle: boolean;
  /** Sessions on desktop only: toggles the floating mini-player. */
  popOut?: { active: boolean; onToggle: () => void };
}) {
  const { iframeRef } = useWebPreview();
  const deviceActive = viewport.mode !== "fill";
  const containActive = contain || deviceActive;

  return (
    <WebPreviewNavigation className="max-sm:flex-wrap gap-1">
      <WebPreviewNavigationButton
        tooltip={deviceActive ? "Fill panel" : "Show device toolbar"}
        aria-label={deviceActive ? "Fill panel" : "Show device toolbar"}
        aria-pressed={deviceActive}
        className={cn(
          "max-sm:hit-target",
          deviceActive && "bg-secondary text-primary hover:text-primary",
        )}
        onClick={onToggleDevice}
      >
        <IconDevices size={16} />
      </WebPreviewNavigationButton>
      <WebPreviewNavigationButton
        tooltip={
          containActive ? "Fill panel (responsive)" : "Contain aspect ratio"
        }
        aria-label={
          containActive ? "Fill panel (responsive)" : "Contain aspect ratio"
        }
        aria-pressed={containActive}
        className={cn(
          "max-sm:hit-target",
          containActive && "bg-secondary text-primary hover:text-primary",
        )}
        onClick={onToggleContain}
      >
        <IconAspectRatio size={16} />
      </WebPreviewNavigationButton>
      {popOut ? (
        <WebPreviewNavigationButton
          tooltip={popOut.active ? "Bring preview back" : "Pop out preview"}
          aria-label={popOut.active ? "Bring preview back" : "Pop out preview"}
          aria-pressed={popOut.active}
          className={cn(
            popOut.active && "bg-secondary text-primary hover:text-primary",
          )}
          onClick={popOut.onToggle}
        >
          <IconPictureInPicture size={16} />
        </WebPreviewNavigationButton>
      ) : null}
      <PreviewScreenshotButton iframeElement={iframeElement ?? null} />
      {showAnnotationToggle ? (
        <WebPreviewNavigationButton
          tooltip={annotationMode ? "Cancel select element" : "Select element"}
          aria-label={
            annotationMode ? "Cancel select element" : "Select element"
          }
          aria-pressed={annotationMode}
          className={cn(
            "max-sm:hit-target",
            annotationMode && "bg-secondary text-primary hover:text-primary",
          )}
          onClick={() => onAnnotationModeChange(!annotationMode)}
        >
          <IconClick size={16} />
        </WebPreviewNavigationButton>
      ) : null}
      <PreviewNavBar
        previewUrl={previewInfo?.url ?? null}
        iframeRef={iframeRef}
        iframeElement={iframeElement}
        containerRef={containerRef}
        onToggleFullscreen={onToggleFullscreen}
        port={port}
        path={previewPath}
        onPortChange={onPortChange}
        onPathChange={(path) => onPathChange(normalizePreviewPath(path))}
        isLoading={isLoading}
        onRefresh={onRefresh}
      />
    </WebPreviewNavigation>
  );
}
