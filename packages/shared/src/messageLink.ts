/** `?message=<id>`: the chat message a shared link points at. */
export const MESSAGE_LINK_PARAM = "message";

/** Base for parsing a bare path; never appears in the result. */
const PATH_BASE = "http://eva.invalid";

/**
 * A chat URL or path aimed at one message. The rest of the query stays
 * (`?chat=2`), so the link opens the same chat it came from. A path in gives a
 * path out (the mobile app's `getChat().webPath`); a full URL gives a full URL.
 */
export function messageLinkHref(href: string, messageId: string): string {
  const url = new URL(href, PATH_BASE);
  url.searchParams.set(MESSAGE_LINK_PARAM, messageId);
  return url.origin === PATH_BASE ? `${url.pathname}${url.search}${url.hash}` : url.href;
}
