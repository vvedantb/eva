/**
 * Upgrades http to https. Anything that is not http(s), or does not parse,
 * becomes `about:blank`: these URLs feed iframe `src` and new-tab links, where
 * `javascript:` or `data:` would run in the app's origin.
 */
export function ensureHttps(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    return parsed.protocol === "https:" ? parsed.toString() : "about:blank";
  } catch {
    return "about:blank";
  }
}
