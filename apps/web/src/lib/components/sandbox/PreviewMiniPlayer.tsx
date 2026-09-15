"use client";

import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { AnimatePresence, m } from "motion/react";
import { cn, motionSpring } from "@eva/ui";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { PreviewMiniPlayerChrome } from "./_components/PreviewMiniPlayerChrome";
import { dropPreviewGroup, PreviewAnchor } from "./previewIframeHost";
import { DEFAULT_MINI_PLAYER_LOGICAL_SIZE } from "./previewContain";
import {
  closePreviewMiniPlayer,
  usePreviewMiniPlayer,
  type PreviewMiniPlayerEntry,
} from "./previewMiniPlayerStore";
import { usePreviewMiniPlayerFrame } from "./usePreviewMiniPlayerFrame";

/**
 * Floating picture-in-picture window for a session's dev-server preview.
 *
 * Mounted once at the app root, just before {@link PreviewIframeHost} and on
 * the same z layer: the host overlays its iframe on the anchor rendered here,
 * and DOM order makes it paint above this window's background. Nothing is
 * reloaded when a preview floats — the iframe only follows the anchor.
 *
 * Desktop only: below `md` the sandbox pane never arms, and a window that is
 * open when the viewport shrinks simply hides until it grows back.
 *
 * Enter/exit is opacity + scale on the window chrome. Width/height stay in
 * `style` — animating them would resize the hosted iframe overlay.
 */
export function PreviewMiniPlayer() {
  const entry = usePreviewMiniPlayer();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  return (
    <AnimatePresence>
      {entry !== null && isDesktop ? (
        <PreviewMiniPlayerWindow key={entry.entryKey} entry={entry} />
      ) : null}
    </AnimatePresence>
  );
}

function PreviewMiniPlayerWindow({ entry }: { entry: PreviewMiniPlayerEntry }) {
  const navigate = useNavigate();
  const { style, moveHandlers, resizeHandlers, gesture } =
    usePreviewMiniPlayerFrame(entry.entryKey);
  const logicalSize = entry.logicalSize ?? DEFAULT_MINI_PLAYER_LOGICAL_SIZE;
  // The session doc is the truth about whether this iframe still shows a live
  // sandbox; the pane that would normally notice has been unmounted.
  // Blob/data guests are local fixtures (no sandbox doc to reconcile).
  const session = useQuery(
    api.sessions.get,
    entry.src.startsWith("blob:") || entry.src.startsWith("data:")
      ? "skip"
      : { id: entry.sessionId },
  );
  const stale =
    session === null ||
    (session !== undefined &&
      (session.sandboxId !== entry.sandboxId || session.status !== "active"));

  const expand = () => {
    closePreviewMiniPlayer();
    void navigate({ to: entry.returnTo });
  };

  return (
    <m.div
      role="dialog"
      aria-label={`Preview: ${entry.title}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={motionSpring}
      style={style}
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden rounded-surface bg-background smooth-shadow-ring-xl origin-bottom-right",
        gesture !== null && "select-none",
      )}
    >
      <PreviewMiniPlayerChrome
        title={entry.title}
        moveHandlers={moveHandlers}
        isMoving={gesture === "move"}
        onExpand={expand}
        onClose={closePreviewMiniPlayer}
      />
      <div className="relative min-h-0 flex-1 bg-black">
        <PreviewAnchor
          entryKey={entry.entryKey}
          group={entry.group}
          src={entry.src}
          epoch={entry.epoch}
          logicalSize={logicalSize}
          role="miniPlayer"
        />
      </div>
      {/* A footer, not a corner overlay: the hosted iframe is rectangular and
          would poke through rounded bottom corners drawn over it. */}
      <div className="relative h-2.5 shrink-0 bg-muted">
        <div
          {...resizeHandlers}
          role="separator"
          aria-label="Resize preview"
          aria-orientation="horizontal"
          className="absolute right-0 bottom-0 size-5 cursor-nwse-resize touch-none"
        >
          <span className="absolute right-1 bottom-1 size-1.5 rounded-full bg-muted-foreground/50" />
        </div>
      </div>
      {stale ? <StalePreviewSweeper sandboxId={entry.sandboxId} /> : null}
    </m.div>
  );
}

/**
 * Commit-phase side effect without an effect: mounting this runs the ref
 * callback once, which drops the sandbox's iframes and thereby closes the
 * window (the store listens to `dropPreviewGroup`).
 */
function StalePreviewSweeper({ sandboxId }: { sandboxId: string }) {
  return (
    <span
      hidden
      ref={() => {
        dropPreviewGroup(sandboxId);
      }}
    />
  );
}
