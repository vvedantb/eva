/**
 * Guards for URLs that come from data (markdown, notifications, agent
 * output) before they reach a link, `window.open`, an iframe or the router.
 */

/**
 * True only for http(s). `javascript:` and `data:` would run script in the
 * app's origin. A relative URL resolves against an https base, so it passes.
 */
export function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url, "https://eva.invalid");
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * True only for an app-internal path such as `/owner/repo/inbox`. Rejects
 * full URLs and `//other-site`, plus backslashes and control characters,
 * because browsers read `/\other-site` and `/<tab>/other-site` as another host.
 */
export function isInternalAppHref(href: string): boolean {
  return (
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.includes("\\") &&
    !hasControlChar(href)
  );
}

/** C0 controls, DEL and C1 controls (Unicode category Cc). */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}
