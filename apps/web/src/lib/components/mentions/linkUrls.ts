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
