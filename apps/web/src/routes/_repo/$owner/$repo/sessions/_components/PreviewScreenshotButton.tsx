"use client";

import { useState } from "react";
import {
  CrossfadeIcon,
  Spinner,
  toast,
  WebPreviewNavigationButton,
} from "@eva/ui";
import { IconCamera } from "@tabler/icons-react";
import {
  downloadPreviewScreenshot,
  parseScreenshotInbound,
} from "../_utils/previewScreenshot";

const CAPTURE_TIMEOUT_MS = 15_000;

async function copyOrDownloadScreenshot(dataUrl: string): Promise<void> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type || "image/png"]: blob }),
    ]);
    toast.success("Screenshot copied", {
      action: {
        label: "Download",
        onClick: () => downloadPreviewScreenshot(blob),
      },
    });
  } catch {
    downloadPreviewScreenshot(blob);
    toast.success("Screenshot downloaded");
  }
}

export function PreviewScreenshotButton({
  iframeElement,
}: {
  iframeElement: HTMLIFrameElement | null;
}) {
  const [capturing, setCapturing] = useState(false);

  function capture() {
    const frame = iframeElement;
    const target = frame?.contentWindow;
    if (!frame || !target) {
      toast.error("Preview isn't ready to screenshot");
      return;
    }

    const requestId = crypto.randomUUID();
    setCapturing(true);
    const timeoutId = window.setTimeout(() => {
      finish();
      toast.error("Screenshot timed out");
    }, CAPTURE_TIMEOUT_MS);

    function finish() {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeoutId);
      setCapturing(false);
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== target) return;
      if (typeof event.data !== "object" || event.data === null) return;
      const inbound = parseScreenshotInbound(event.data);
      if (!inbound || inbound.requestId !== requestId) return;
      finish();
      if (inbound.type === "error") {
        toast.error(inbound.message);
        return;
      }
      void copyOrDownloadScreenshot(inbound.dataUrl).catch(() => {
        toast.error("Couldn't save the screenshot");
      });
    }

    window.addEventListener("message", onMessage);
    target.postMessage(
      { type: "eva-preview-screenshot-capture", requestId },
      "*",
    );
  }

  return (
    <WebPreviewNavigationButton
      tooltip={capturing ? "Capturing…" : "Screenshot"}
      className="max-sm:hit-target"
      disabled={capturing || iframeElement === null}
      onClick={capture}
    >
      <CrossfadeIcon
        show={capturing}
        trueKey="loading"
        falseKey="idle"
        variant="soft"
        className="relative flex size-3.5 items-center justify-center"
        whenTrue={<Spinner size="sm" />}
        whenFalse={<IconCamera className="h-3.5 w-3.5" />}
      />
    </WebPreviewNavigationButton>
  );
}
