/**
 * `type` names of the postMessage protocol between Eva and a preview iframe.
 * Senders and receivers live in three places that cannot share runtime code
 * freely: the web app, the auth proxy's nav-sync script (a String.raw template
 * in `_sandbox_runtime/previewProxy.ts`, which interpolates these), and the
 * bundled annotation script (`preview-annotation-src`, which type-imports them
 * so its literals are checked). Keep this file free of imports: the annotation
 * script's tsconfig resolves it directly.
 */
export const PREVIEW_FRAME_MESSAGE = {
  // Nav-sync script → Eva.
  navigation: "navigation",
  unload: "eva-preview-unload",
  // Eva → nav-sync script.
  historyBack: "eva-preview-history-back",
  historyForward: "eva-preview-history-forward",
  // Annotation script → Eva.
  annotateReady: "eva-preview-annotate-ready",
  annotateSelected: "eva-preview-annotate-selected",
  annotateRect: "eva-preview-annotate-rect",
  annotateDismissed: "eva-preview-annotate-dismissed",
  annotateFrozen: "eva-preview-annotate-frozen",
  screenshot: "eva-preview-screenshot",
  screenshotError: "eva-preview-screenshot-error",
  snapshot: "eva-preview-snapshot",
  snapshotError: "eva-preview-snapshot-error",
  webMcpTools: "eva-preview-webmcp-tools",
  webMcpResult: "eva-preview-webmcp-result",
  webMcpError: "eva-preview-webmcp-error",
  // Eva → annotation script.
  annotateMode: "eva-preview-annotate-mode",
  annotateFreeze: "eva-preview-annotate-freeze",
  annotateClear: "eva-preview-annotate-clear",
  screenshotCapture: "eva-preview-screenshot-capture",
  snapshotCapture: "eva-preview-snapshot-capture",
  webMcpList: "eva-preview-webmcp-list",
  webMcpInvoke: "eva-preview-webmcp-invoke",
} as const;
