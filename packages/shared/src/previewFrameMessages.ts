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
  screenshot: "eva-preview-screenshot",
  screenshotError: "eva-preview-screenshot-error",
  snapshot: "eva-preview-snapshot",
  snapshotError: "eva-preview-snapshot-error",
  webMcpTools: "eva-preview-webmcp-tools",
  webMcpResult: "eva-preview-webmcp-result",
  webMcpError: "eva-preview-webmcp-error",
  toolbarAction: "eva-preview-toolbar-action",
  // Eva → annotation script.
  annotateMode: "eva-preview-annotate-mode",
  annotateClear: "eva-preview-annotate-clear",
  screenshotCapture: "eva-preview-screenshot-capture",
  snapshotCapture: "eva-preview-snapshot-capture",
  webMcpList: "eva-preview-webmcp-list",
  webMcpInvoke: "eva-preview-webmcp-invoke",
  toolbarState: "eva-preview-toolbar-state",
} as const;

/**
 * Resolved colours of Eva's own design tokens, read from the live app by Eva
 * and sent in, so the toolbar matches Eva's bar in light and dark. The page
 * cannot see Eva's CSS variables; the toolbar's own light and dark palettes
 * cover a direct link.
 */
export interface PreviewToolbarTheme {
  fontFamily: string;
  /** `bg-popover/95` of the bar and the tooltip. */
  surface: string;
  /** `text-popover-foreground` of the tooltip. */
  surfaceText: string;
  /** `smooth-shadow-ring-lg` of the bar. */
  barShadow: string;
  /** `smooth-shadow-ring-md` of the tooltip. */
  tipShadow: string;
  /** `rounded-surface` of the tooltip. */
  tipRadius: string;
  /** Ghost button: `text-muted-foreground`. */
  idleText: string;
  /** Ghost button hover: `bg-muted/60 text-foreground`. */
  hoverBg: string;
  hoverText: string;
  /** Pressed toggle: `bg-secondary text-primary`. */
  activeBg: string;
  activeText: string;
  /** Count badge: `bg-foreground text-background`. */
  badgeBg: string;
  badgeText: string;
  /** `bg-card`, the disc behind the Eva mark. */
  disc: string;
}
