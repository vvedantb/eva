import { expect, test } from "vitest";
import { appendRelatedPrsSection, buildPrBody } from "../convex/prBody";

/**
 * Multi-repo sessions open one draft PR per repo. Every PR body should point
 * at its siblings so a reviewer looking at one repo's PR can jump straight to
 * the matching PRs in linked repos — appendRelatedPrsSection is the pure piece
 * that adds that section, kept separate from buildPrBody so single-repo
 * sessions (the overwhelming majority) see byte-identical PR bodies.
 */

test("no-op when there are no sibling PRs", () => {
  const body = buildPrBody(
    [{ heading: "Summary", content: "- did a thing" }],
    "https://eva.example.com/owner/repo/sessions/abc",
  );
  expect(appendRelatedPrsSection(body, [])).toBe(body);
});

test("appends a Related PRs section with sibling links", () => {
  const body = buildPrBody([{ heading: "Summary", content: "- did a thing" }]);
  const withSiblings = appendRelatedPrsSection(body, [
    { label: "owner/api", url: "https://github.com/owner/api/pull/12" },
    { label: "owner/web", url: "https://github.com/owner/web/pull/34" },
  ]);

  expect(withSiblings.startsWith(body)).toBe(true);
  expect(withSiblings).toContain("## Related PRs");
  expect(withSiblings).toContain(
    "- [owner/api](https://github.com/owner/api/pull/12)",
  );
  expect(withSiblings).toContain(
    "- [owner/web](https://github.com/owner/web/pull/34)",
  );
});

test("Related PRs section comes after the existing body, in sibling order", () => {
  const body = "## Summary\nsomething\n\n---\n*Created by Eva*";
  const withSiblings = appendRelatedPrsSection(body, [
    { label: "first", url: "https://github.com/owner/first/pull/1" },
    { label: "second", url: "https://github.com/owner/second/pull/2" },
  ]);
  const relatedIndex = withSiblings.indexOf("## Related PRs");
  const firstIndex = withSiblings.indexOf("[first]");
  const secondIndex = withSiblings.indexOf("[second]");
  expect(relatedIndex).toBeGreaterThan(-1);
  expect(firstIndex).toBeGreaterThan(relatedIndex);
  expect(secondIndex).toBeGreaterThan(firstIndex);
});
