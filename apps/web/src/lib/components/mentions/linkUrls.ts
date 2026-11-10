/**
 * Detects external links that the composer and plain-text bodies render as
 * links (underline + favicon, same as chat markdown). Only these hosts are
 * matched, so typing a URL by hand does not turn into a link after `https://x`.
 *
 * Links are matched by their raw URL (no token grammar) and are safe to scan in
 * free prose because the host is part of the pattern.
 */
const LINK_URL_SOURCES: readonly string[] = [
  "https?://(?:www\\.)?figma\\.com/[^\\s)]+",
  "https?://(?:www\\.)?github\\.com/[^\\s)]+",
  "https?://linear\\.app/[^\\s)]+",
  "https?://(?:[a-z0-9-]+\\.)?sentry\\.io/[^\\s)]+",
  "https?://(?:[a-z0-9-]+\\.)?posthog\\.com/[^\\s)]+",
];

/**
 * Combined alternation source for every detected link host. Consumers build
 * their own `new RegExp(LINK_URL_SOURCE, "g")` so the shared module-level regex
 * never carries `lastIndex` state across calls.
 */
export const LINK_URL_SOURCE = LINK_URL_SOURCES.join("|");

/** How many detected link URLs `text` holds. */
export function countLinkUrls(text: string): number {
  return [...text.matchAll(new RegExp(LINK_URL_SOURCE, "g"))].length;
}
