"use client";

import { useState } from "react";
import { Spinner, toast, WebPreviewNavigationButton } from "@eva/ui";
import { IconListTree } from "@tabler/icons-react";
import { parseSnapshotInbound } from "@/lib/components/sandbox/previewSnapshot";
import { PreviewSnapshotDialog } from "@/lib/components/sandbox/PreviewSnapshotDialog";
import { usePendingPreviewSnapshots } from "@/lib/contexts/PendingPreviewSnapshotsContext";
import type { PreviewSnapshot } from "@/lib/components/sandbox/previewSnapshot";

const CAPTURE_TIMEOUT_MS = 20_000;

export function PreviewSnapshotButton({
  iframeElement,
  seedSnapshot,
}: {
  iframeElement: HTMLIFrameElement | null;
  /** Opens the dialog with this snapshot instead of capturing (demo / tests). */
  seedSnapshot?: PreviewSnapshot;
}) {
  const pending = usePendingPreviewSnapshots();
  const [capturing, setCapturing] = useState(false);
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(
    seedSnapshot ?? null,
  );
  const [open, setOpen] = useState(seedSnapshot !== undefined);

  function capture() {
    if (seedSnapshot) {
      setSnapshot(seedSnapshot);
      setOpen(true);
      return;
    }
    const frame = iframeElement;
    const target = frame?.contentWindow;
    if (!frame || !target) {
      toast.error("Preview isn't ready to snapshot");
      return;
    }

    const requestId = crypto.randomUUID();
    setCapturing(true);
    const timeoutId = window.setTimeout(() => {
      finish();
      toast.error("Snapshot timed out");
    }, CAPTURE_TIMEOUT_MS);

    function finish() {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeoutId);
      setCapturing(false);
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== target) return;
      if (typeof event.data !== "object" || event.data === null) return;
      const inbound = parseSnapshotInbound(event.data);
      if (!inbound || inbound.requestId !== requestId) return;
      finish();
      if (inbound.type === "error") {
        toast.error(inbound.message);
        return;
      }
      setSnapshot(inbound.snapshot);
      setOpen(true);
    }

    window.addEventListener("message", onMessage);
    target.postMessage(
      { type: "eva-preview-snapshot-capture", requestId },
      "*",
    );
  }

  return (
    <>
      <WebPreviewNavigationButton
        tooltip={capturing ? "Capturing snapshot…" : "Semantic snapshot"}
        aria-label={capturing ? "Capturing snapshot" : "Semantic snapshot"}
        className="max-sm:hit-target"
        disabled={capturing || (iframeElement === null && !seedSnapshot)}
        data-testid="preview-snapshot-button"
        onClick={capture}
      >
        {capturing ? (
          <Spinner size="sm" />
        ) : (
          <IconListTree className="h-3.5 w-3.5" />
        )}
      </WebPreviewNavigationButton>
      <PreviewSnapshotDialog
        snapshot={snapshot}
        open={open}
        onOpenChange={setOpen}
        onAddToChat={
          pending
            ? (next) => {
                pending.add(next);
                toast.success("Snapshot added to chat");
              }
            : undefined
        }
      />
    </>
  );
}
