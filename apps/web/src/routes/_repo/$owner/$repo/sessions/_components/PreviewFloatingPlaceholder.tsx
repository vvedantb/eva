"use client";

import { AnimatePresence, m } from "motion/react";
import { IconPictureInPicture } from "@tabler/icons-react";
import { Button, motionFast } from "@eva/ui";
import { closePreviewMiniPlayer } from "@/lib/components/sandbox/previewMiniPlayerStore";

/**
 * Stands in for the preview body while the user has popped it out. Only one
 * anchor may claim a hosted iframe, so the pane must not render its own until
 * the mini-player gives the preview back.
 *
 * Opacity lives on this shell only — the live iframe stays unanimated, and the
 * swap is a crossfade of this placeholder in and out.
 */
export function PreviewFloatingPlaceholder() {
  return (
    <AnimatePresence>
      <m.div
        key="preview-floating-placeholder"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={motionFast}
        className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground"
      >
        <IconPictureInPicture className="size-12 opacity-50" />
        <p className="text-sm">Preview is floating</p>
        <Button size="sm" variant="secondary" onClick={closePreviewMiniPlayer}>
          Bring back
        </Button>
      </m.div>
    </AnimatePresence>
  );
}
