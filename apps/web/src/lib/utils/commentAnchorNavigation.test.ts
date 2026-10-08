import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMENT_ANCHOR_PARAM, withCommentAnchor } from "@eva/backend";
import { parseCommentAnchorSearchField } from "@/lib/search-params";
import { hrefToNavigateOptions } from "./repoUrl";

/**
 * Regression guard for the comment-anchor click-through (fix ecb4d0d8c).
 *
 * A comment notification's href carries `?comment=<id>` so the click lands on
 * the comment rather than the top of a task with fifty of them. Four layers
 * have to agree on that one param, and none of them are coupled by a type:
 *
 *   1. the backend writes it into the stored href (`withCommentAnchor`)
 *   2. every click site splits it off the href (`hrefToNavigateOptions`) —
 *      TanStack resolves `to` as a pathname and never splits a query out of it,
 *      so handing the href over whole matched no route at all
 *   3. a route with a `validateSearch` has to name the key or TanStack drops it
 *   4. the reader looks it up by name through nuqs (`COMMENT_ANCHOR_PARAM`)
 *
 * Break any link and the notification silently degrades to "top of page" with
 * no type error and no thrown error to notice.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFileSync(join(here, path), "utf8");

const COMMENT_ID = "k17d2fp8x4wq9c0abcdefgh";
const TASK_HREF = "/evalucom/carepulse-ts/quick-tasks/204";

describe("comment anchor round trip", () => {
  it("carries the id from a stored href into router search", () => {
    const { to, search } = hrefToNavigateOptions(
      withCommentAnchor(TASK_HREF, COMMENT_ID),
    );
    expect(to).toBe(TASK_HREF);
    // Looked up by the same constant the reader uses, so renaming it on one
    // side only fails here rather than in prod.
    expect(search[COMMENT_ANCHOR_PARAM]).toBe(COMMENT_ID);
  });

  it("appends to an href that already carries a query", () => {
    const href = withCommentAnchor(
      "/evalucom/carepulse-ts/docs/12/content?tab=comments",
      COMMENT_ID,
    );
    expect(href).toContain(`&${COMMENT_ANCHOR_PARAM}=`);
    const { to, search } = hrefToNavigateOptions(href);
    expect(to).toBe("/evalucom/carepulse-ts/docs/12/content");
    expect(search).toEqual({ tab: "comments", comment: COMMENT_ID });
  });

  // The param name is a wire format, not an implementation detail: hrefs are
  // snapshotted onto notification rows, so every notification already in the
  // database spells it this way forever.
  it("pins the stored spelling of the param", () => {
    expect(COMMENT_ANCHOR_PARAM).toBe("comment");
    expect(withCommentAnchor(TASK_HREF, COMMENT_ID)).toBe(
      `${TASK_HREF}?comment=${COMMENT_ID}`,
    );
  });

  // Rows written before the anchor existed carry no param, and a plain visit is
  // the same shape — both have to resolve to "no anchor", never to a stray key.
  it("yields no anchor for an unanchored href", () => {
    expect(hrefToNavigateOptions(TASK_HREF).search).toEqual({});
  });
});

describe("routes that a comment notification lands on", () => {
  it("hands the anchor through the quick-tasks validateSearch", () => {
    const { search } = hrefToNavigateOptions(
      withCommentAnchor(TASK_HREF, COMMENT_ID),
    );
    expect(parseCommentAnchorSearchField(search)).toEqual({
      comment: COMMENT_ID,
    });
  });

  // Omitted, not `{ comment: undefined }`: TanStack derives the route's search
  // type from this return, and a required-but-undefined key would force every
  // `navigate({ search })` call site under the route to restate it.
  it("omits the key entirely when there is no anchor", () => {
    const parsed = parseCommentAnchorSearchField({});
    expect(parsed).toEqual({});
    expect(Object.keys(parsed)).not.toContain("comment");
  });

  // Read off disk because a route module cannot be imported in the node test
  // environment. Quick Tasks is the only repo route with a `validateSearch`,
  // and it is where task comment notifications land.
  it("is spread into the quick-tasks route", () => {
    const route = source(
      "../../routes/_repo/$owner/$repo/quick-tasks/route.tsx",
    );
    expect(route).toContain("parseCommentAnchorSearchField(search)");
  });
});

/**
 * Three surfaces navigate from a stored notification href. The toast used to
 * pass the raw href to `navigate({ to })`, skipping both the search split and
 * the `repo--app` rewrite, so a monorepo notification went nowhere.
 */
describe("every notification click-through", () => {
  const clickSites = [
    "../components/inbox/InboxClient.tsx",
    "../components/NotificationToastStream.tsx",
    "../embed/EmbedNavigationBridge.tsx",
  ];

  it.each(clickSites)("%s navigates via hrefToNavigateOptions", (path) => {
    expect(source(path)).toContain("hrefToNavigateOptions(");
  });

  it.each(clickSites)("%s never passes a raw href as `to`", (path) => {
    // `navigate({ to: notification.href })` in any spelling — a literal path
    // such as `to: "/inbox"` is fine and does not match.
    expect(source(path)).not.toMatch(/to:\s*[\w.]*\bhref\b/);
  });
});
