"use client";

import { useState } from "react";
import { toast } from "@vvedantb/ui";
import {
  downloadPreviewScreenshot,
  requestPreviewScreenshot,
} from "../_utils/previewScreenshot";

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

/** Captures the preview iframe, then copies (or downloads) the PNG. */
export function usePreviewScreenshot(iframeElement: HTMLIFrameElement | null) {
  const [capturing, setCapturing] = useState(false);

  function capture() {
    const target = iframeElement?.contentWindow;
    if (!target) {
      toast.error("Preview isn't ready to screenshot");
      return;
    }
    setCapturing(true);
    requestPreviewScreenshot(target)
      .then(
        (dataUrl) =>
          copyOrDownloadScreenshot(dataUrl).catch(() => {
            toast.error("Couldn't save the screenshot");
          }),
        (error: Error) => {
          toast.error(error.message);
        },
      )
      .finally(() => setCapturing(false));
  }

  return { capturing, capture };
}
