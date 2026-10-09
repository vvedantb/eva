/**
 * Presence room joined by anyone with a sandbox tab (preview, terminal, editor,
 * desktop, files, custom tab) on screen AND in use (see
 * `SANDBOX_ENGAGED_WINDOW_MS`). The idle-pause sweep treats a populated room as
 * "someone is using the sandbox now". Chat-only presence is a different room
 * and never keeps a sandbox awake.
 */
export function sandboxPresenceRoomId(entityId: string): string {
  return `sandbox:${entityId}`;
}

/**
 * A visible tab counts as "in use" only for this long after the last input
 * (pointer, key, wheel, scroll, touch, or switching to the tab). A tab left
 * visible on an unattended screen kept session 98 awake overnight; after this
 * window it leaves presence, sends no preview ping and never auto-wakes.
 */
export const SANDBOX_ENGAGED_WINDOW_MS = 10 * 60_000;

/**
 * DOM events that count as input, for the Eva app and for every page the
 * sandbox proxy serves (preview, custom tabs, editor, desktop). Listened to on
 * `window` in the capture phase, since `scroll` does not bubble.
 */
export const SANDBOX_ENGAGEMENT_INPUT_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const;

/** True when the tab is visible and had input inside the engaged window. */
export function isSandboxUserEngaged(input: {
  visible: boolean;
  lastInputAt: number;
  now: number;
}): boolean {
  return (
    input.visible && input.now - input.lastInputAt < SANDBOX_ENGAGED_WINDOW_MS
  );
}
