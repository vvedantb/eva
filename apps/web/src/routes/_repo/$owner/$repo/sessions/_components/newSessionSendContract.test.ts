import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "NewSessionComposer.tsx"), "utf8");

/**
 * Regression: sending from the landing composer created the session and then
 * stayed on the composer.
 *
 * The send used to clear the codebases picker (`codebases.clear()`) before
 * navigating. That selection is query-string state held by nuqs, whose
 * TanStack adapter flushes on a later tick and navigates to
 * `pathname + search` — the pathname captured when the adapter last rendered,
 * which is the composer's. The flush therefore landed *after* the navigation
 * and replaced the new session's URL with the composer's again.
 *
 * Nothing in the send path may write URL state: leaving the page already drops
 * the search params, so there is nothing to clear.
 */
describe("the new-session send navigates without writing URL state", () => {
  const between = source.slice(
    source.indexOf("await createSession("),
    source.indexOf("await navigate("),
  );

  test("the send path is the one being read", () => {
    expect(source).toContain("await createSession(");
    expect(source).toContain("await navigate(");
    expect(between.length).toBeGreaterThan(0);
  });

  test("no query-string write sits between create and navigate", () => {
    expect(between).not.toMatch(/codebases\.\w+\(/);
    expect(between).not.toContain("setParams(");
  });
});
