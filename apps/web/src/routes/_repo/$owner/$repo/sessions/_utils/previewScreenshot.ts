import { isFromFrame, postToFrame } from "@/lib/utils/frameMessaging";

export type PreviewScreenshotInbound =
  | { type: "screenshot"; requestId: string; dataUrl: string }
  | { type: "error"; requestId: string; message: string };

export function parseScreenshotInbound(
  data: object,
): PreviewScreenshotInbound | null {
  if (!("type" in data) || typeof data.type !== "string") return null;
  if (!("requestId" in data) || typeof data.requestId !== "string") return null;
  if (data.type === "eva-preview-screenshot") {
    if (!("dataUrl" in data) || typeof data.dataUrl !== "string") return null;
    if (!data.dataUrl.startsWith("data:image/")) return null;
    return {
      type: "screenshot",
      requestId: data.requestId,
      dataUrl: data.dataUrl,
    };
  }
  if (data.type === "eva-preview-screenshot-error") {
    if (!("message" in data) || typeof data.message !== "string") return null;
    return { type: "error", requestId: data.requestId, message: data.message };
  }
  return null;
}

export function downloadPreviewScreenshot(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `preview-${Date.now()}.png`;
  link.click();
  URL.revokeObjectURL(url);
}

const CAPTURE_TIMEOUT_MS = 15_000;

/**
 * Asks the preview page to render its viewport and resolves with a PNG data
 * URL. Rejects with the page's own message, or on timeout.
 */
export function requestPreviewScreenshot(
  frame: HTMLIFrameElement,
): Promise<string> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Screenshot timed out"));
    }, CAPTURE_TIMEOUT_MS);

    function onMessage(event: MessageEvent) {
      if (!isFromFrame(event, frame)) return;
      if (typeof event.data !== "object" || event.data === null) return;
      const inbound = parseScreenshotInbound(event.data);
      if (!inbound || inbound.requestId !== requestId) return;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeoutId);
      if (inbound.type === "error") {
        reject(new Error(inbound.message));
        return;
      }
      resolve(inbound.dataUrl);
    }

    window.addEventListener("message", onMessage);
    postToFrame(frame, { type: "eva-preview-screenshot-capture", requestId });
  });
}
