"use client";

import { useState } from "react";
import { Spinner, toast, WebPreviewNavigationButton } from "@eva/ui";
import { IconPlug } from "@tabler/icons-react";
import { parseWebMcpInbound } from "@/lib/components/sandbox/previewWebMcp";
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

    const requestId = crypto.randomUUID();
    setDiscovering(true);
    const timeoutId = window.setTimeout(() => {
      finish();
      toast.error("Page tools timed out");
    }, DISCOVER_TIMEOUT_MS);

    function finish() {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeoutId);
      setDiscovering(false);
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== target) return;
      if (typeof event.data !== "object" || event.data === null) return;
      const inbound = parseWebMcpInbound(event.data);
      if (!inbound || inbound.requestId !== requestId) return;
      // A "result" carrying this requestId is not an answer to discovery: keep
      // listening rather than silently ending it with no dialog and no error.
      if (inbound.type === "result") return;
      finish();
      if (inbound.type === "error") {
        toast.error(inbound.message);
        return;
      }
      setDiscovery(inbound.discovery);
      setOpen(true);
    }

    window.addEventListener("message", onMessage);
    target.postMessage({ type: "eva-preview-webmcp-list", requestId }, "*");
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
