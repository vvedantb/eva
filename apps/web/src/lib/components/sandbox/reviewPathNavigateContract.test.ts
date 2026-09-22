import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const prTab = read("./usePrTabParam.ts");
const diffSearch = read("./useDiffSearchParams.ts");
const projectDetail = read(
  "../../../routes/_repo/$owner/$repo/projects/ProjectDetailClient.tsx",
);

/**
 * `navigate({ to })` matches the route tree before the history rewrite, so a
 * slash-form monorepo path (`/owner/repo/app/…`) misses. These two hooks
 * rebuild the next Review URL from `location.pathname`; project chat also
 * jumps to Browser / Agents with `basePath`. All three have to internalize.
 */
describe("review and project sandbox path navigations are internalized", () => {
  test("setPrTab and setDiffView wrap the rebuilt path", () => {
    expect(prTab).toContain("to: toInternalRepoHref(nextPath)");
    expect(diffSearch).toContain("to: toInternalRepoHref(nextPath)");
    expect(prTab).not.toMatch(/to:\s*nextPath\b/);
    expect(diffSearch).not.toMatch(/to:\s*nextPath\b/);
  });

  test("project Browser lock and Agents CTA use toInternalRepoHref", () => {
    expect(projectDetail).not.toContain(
      "to: `${basePath}/projects/${projectPathSegment}/sandbox/browser`",
    );
    expect(projectDetail).not.toContain(
      "to: `${basePath}/projects/${projectPathSegment}/sandbox/agents`",
    );
    expect(projectDetail).toContain(
      "${basePath}/projects/${projectPathSegment}/sandbox/browser",
    );
    expect(projectDetail).toContain(
      "${basePath}/projects/${projectPathSegment}/sandbox/agents",
    );
  });
});

function read(relativePath: string): string {
  return readFileSync(join(here, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}
