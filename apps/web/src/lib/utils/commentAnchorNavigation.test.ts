import { describe, expect, it } from "bun:test";
import { COMMENT_ANCHOR_PARAM, withCommentAnchor } from "@eva/backend";
import { parseCommentAnchorSearchField } from "@/lib/search-params";
import { hrefToNavigateOptions } from "./repoUrl";

const COMMENT_ID = "k17d2fp8x4wq9c0abcdefgh";
const TASK_HREF = "/evalucom/carepulse-ts/quick-tasks/204";

describe("comment anchor round trip", () => {
  it("carries the id from a stored href into router search", () => {
    const { to, search } = hrefToNavigateOptions(
      withCommentAnchor(TASK_HREF, COMMENT_ID),
    );
    expect(to).toBe(TASK_HREF);
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

  it("pins the stored spelling of the param", () => {
    expect(COMMENT_ANCHOR_PARAM).toBe("comment");
    expect(withCommentAnchor(TASK_HREF, COMMENT_ID)).toBe(
      `${TASK_HREF}?comment=${COMMENT_ID}`,
    );
  });

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

  it("omits the key entirely when there is no anchor", () => {
    const parsed = parseCommentAnchorSearchField({});
    expect(parsed).toEqual({});
    expect(Object.keys(parsed)).not.toContain("comment");
  });
});
