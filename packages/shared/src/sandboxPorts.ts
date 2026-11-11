/**
 * Public sandbox ports the web app and Convex both address. The auth preview
 * proxy owns each slot; the real servers listen on internal ports behind it.
 */

/** App Preview: the port the Preview pane falls back to when no dev port is set. */
export const DEFAULT_PREVIEW_PORT = 3000;

/** Desktop pane (noVNC). */
export const DESKTOP_PORT = 6080;

/** Editor pane (code-server). */
export const EDITOR_PORT = 8080;
