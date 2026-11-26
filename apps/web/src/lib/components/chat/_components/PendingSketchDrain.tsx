"use client";

import { useEffect } from "react";
import { usePromptInputController } from "@vvedantb/ui";
import { usePendingPreviewSnapshots } from "@/lib/contexts/PendingPreviewSnapshotsContext";

/**
 * Moves sketches made on the preview into this composer's attachments, so
 * they upload and send like any attached image. Render inside the composer's
 * `PromptInputProvider`.
 */
export function PendingSketchDrain() {
  const pending = usePendingPreviewSnapshots();
  const { attachments } = usePromptInputController();
  const sketchCount = pending?.sketchCount ?? 0;

  useEffect(() => {
    if (!pending || sketchCount === 0) return;
    const files = pending.takeSketches();
    if (files.length > 0) attachments.add(files);
  }, [pending, sketchCount, attachments]);

  return null;
}
