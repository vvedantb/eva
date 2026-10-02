"use client";

import { useState } from "react";
import { Spinner, toast, WebPreviewNavigationButton } from "@eva/ui";
import { IconPlug } from "@tabler/icons-react";
import { requestWebMcp } from "@/lib/components/sandbox/previewWebMcp";
import { PreviewWebMcpDialog } from "@/lib/components/sandbox/PreviewWebMcpDialog";
import { usePendingWebMcp } from "@/lib/contexts/PendingWebMcpContext";
import type { WebMcpDiscovery } from "@/lib/components/sandbox/previewWebMcp";

const DISCOVER_TIMEOUT_MS = 12_000;

export function PreviewWebMcpButton({
  iframeElement,
  seedDiscovery,
}: {
  iframeElement: HTMLIFrameElement | null;
  /** Opens the dialog with this catalogue instead of discovering (demo / tests). */
  seedDiscovery?: WebMcpDiscovery;
}) {
  const pending = usePendingWebMcp();
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState<WebMcpDiscovery | null>(
    seedDiscovery ?? null,
  );
  const [open, setOpen] = useState(seedDiscovery !== undefined);

  function discover() {
    if (seedDiscovery) {
      setDiscovery(seedDiscovery);
      setOpen(true);
      return;
    }
    const frame = iframeElement;
    const target = frame?.contentWindow;
    if (!frame || !target) {
      toast.error("Preview isn't ready to list page tools");
      return;
    }

    setDiscovering(true);
    void requestWebMcp(target, { type: "list" }, DISCOVER_TIMEOUT_MS).then(
      (inbound) => {
        setDiscovering(false);
        if (inbound.type === "error") {
          toast.error(inbound.message);
          return;
        }
        if (inbound.type !== "tools") return;
        setDiscovery(inbound.discovery);
        setOpen(true);
      },
      () => {
        setDiscovering(false);
        toast.error("Page tools timed out");
      },
    );
  }

  return (
    <>
      <WebPreviewNavigationButton
        tooltip={discovering ? "Listing page tools…" : "Page tools"}
        aria-label={discovering ? "Listing page tools" : "Page tools"}
        className="max-sm:hit-target"
        disabled={discovering || (iframeElement === null && !seedDiscovery)}
        data-testid="preview-webmcp-button"
        onClick={discover}
      >
        {discovering ? (
          <Spinner size="sm" />
        ) : (
          <IconPlug className="h-3.5 w-3.5" />
        )}
      </WebPreviewNavigationButton>
      <PreviewWebMcpDialog
        discovery={discovery}
        open={open}
        onOpenChange={setOpen}
        onAddToChat={
          pending
            ? (next) => {
                pending.add(next);
                toast.success("Page tools added to chat");
              }
            : undefined
        }
      />
    </>
  );
}
