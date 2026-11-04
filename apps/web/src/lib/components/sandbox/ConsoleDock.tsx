"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@eva/ui";
import { rubberband } from "@vvedantb/ui";
import {
  IconChevronDown,
  IconChevronUp,
  IconTerminal2,
} from "@tabler/icons-react";
import type { ConsoleDockApi } from "./useConsoleDock";

const DEFAULT_PREVIEW_PCT = 60;
const MIN_PREVIEW_PCT = 15;
const MAX_PREVIEW_PCT = 85;

function rubberbandPreviewPct(pct: number): number {
  if (pct < MIN_PREVIEW_PCT) {
    return MIN_PREVIEW_PCT - rubberband(MIN_PREVIEW_PCT - pct, 100);
  }
  if (pct > MAX_PREVIEW_PCT) {
    return MAX_PREVIEW_PCT + rubberband(pct - MAX_PREVIEW_PCT, 100);
  }
  return pct;
}

function clampPreviewPct(pct: number): number {
  return Math.min(MAX_PREVIEW_PCT, Math.max(MIN_PREVIEW_PCT, pct));
}

interface ConsoleDockProps {
  controller: ConsoleDockApi;
  /** Top region — the web preview. */
  preview: ReactNode;
  /**
   * Bottom "Console" region. `visible` is true only when expanded and not
   * mid-drag, so the caller can gate the terminal's foreground fit/resize.
   */
  renderConsole: (visible: boolean) => ReactNode;
}

/**
 * Stacks the web preview over a collapsible "Console" row. Collapsed by default;
 * when expanded the two rows share the height at `previewPct` with a draggable
 * divider. Both regions stay mounted across toggle/drag (CSS-only hide) so the
 * preview iframe and the console PTY never remount.
 */
export function ConsoleDock({
  controller,
  preview,
  renderConsole,
}: ConsoleDockProps) {
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const rawPctRef = useRef(DEFAULT_PREVIEW_PCT);
  const { expanded, previewPct, toggle, setPreviewPct } = controller;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    rawPctRef.current = previewPct;
    setDragging(true);
  };

  // Live drag writes the preview height straight to the node. Routing it through
  // `setState` would run a JSON.stringify + localStorage.setItem + storage-event
  // dispatch on every pointermove — synchronous main-thread work on the input path.
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.height === 0) return;
    const pct = ((e.clientY - rect.top) / rect.height) * 100;
    rawPctRef.current = pct;
    if (previewRef.current) {
      previewRef.current.style.height = `${rubberbandPreviewPct(pct)}%`;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    const committed = clampPreviewPct(rawPctRef.current);
    // Settle the rubberband before the re-render so React's style write agrees
    // with the DOM instead of racing it.
    if (previewRef.current) {
      previewRef.current.style.height = `${committed}%`;
    }
    setPreviewPct(committed);
    setDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full min-h-0 flex-col", dragging && "select-none")}
    >
      <div
        ref={previewRef}
        className={cn(
          "min-h-0",
          expanded ? "shrink-0 grow-0" : "flex-1",
          // Iframes swallow pointer events; disable them so the drag continues.
          dragging && "pointer-events-none",
        )}
        style={expanded ? { height: `${previewPct}%` } : undefined}
      >
        {preview}
      </div>

      {expanded ? (
        <div className="relative h-0">
          <div
            role="separator"
            aria-orientation="horizontal"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute inset-x-0 -top-1 z-10 h-2.5 cursor-row-resize touch-none"
          />
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={expanded}
        onClick={toggle}
        className="flex h-9 shrink-0 items-center justify-between border-t border-border px-3 text-muted-foreground motion-press active:scale-[0.99] hover:bg-secondary"
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <IconTerminal2 className="size-3.5" />
          Console
        </span>
        {expanded ? (
          <IconChevronDown className="size-4" />
        ) : (
          <IconChevronUp className="size-4" />
        )}
      </button>

      <div
        className={cn(
          // overflow-hidden + min-h-0 so xterm gets a bounded viewport and can
          // scroll scrollback — without this the terminal grows and is clipped.
          expanded ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden",
          dragging && "pointer-events-none",
        )}
      >
        {renderConsole(expanded && !dragging)}
      </div>
    </div>
  );
}
