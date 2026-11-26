/**
 * postMessage with a preview iframe, bound to the origin the frame was pointed
 * at. Never "*": once the page navigates to another site, it neither receives
 * our messages nor gets its replies accepted.
 */

/** The frame's http(s) origin, or null before it has a real `src`. */
export function frameOrigin(frame: HTMLIFrameElement | null): string | null {
  if (!frame?.src) return null;
  try {
    const { protocol, origin } = new URL(frame.src);
    return protocol === "https:" || protocol === "http:" ? origin : null;
  } catch {
    return null;
  }
}

/** Posts to the frame at its own origin; does nothing before it has one. */
export function postToFrame(frame: HTMLIFrameElement | null, message: object) {
  const origin = frameOrigin(frame);
  if (frame && origin) frame.contentWindow?.postMessage(message, origin);
}

/** True when `event` came from `frame`'s window, at the frame's origin. */
export function isFromFrame(
  event: MessageEvent,
  frame: HTMLIFrameElement | null,
): boolean {
  return (
    frame !== null &&
    frame.contentWindow !== null &&
    event.source === frame.contentWindow &&
    event.origin === frameOrigin(frame)
  );
}
