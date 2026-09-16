import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const shell = read("./CachedSessionShell.tsx");
const layout = read("../route.tsx");
const repoContext = read("../../../../../../lib/contexts/RepoContext.tsx");

/**
 * The sessions layout keeps the last few session shells mounted so switching
 * sessions does not remount Preview iframes. That cache outlives `$owner` and
 * `$repo` param changes, so two things bit at once (fix b1049293): bare numIds
 * collide across apps, and a hidden shell that still read the live URL would
 * resolve — and navigate — as the repo now in the address bar.
 */
describe("cached session shells are isolated per repo", () => {
  test("the cache key includes the repo, not just the numId", () => {
    expect(layout).toContain("key: `${owner}/${repo}/${numId}`");
  });

  test("a shell resolves against the repo it was cached with", () => {
    // Reading the live params inside the shell is exactly the regression: a
    // background shell would follow whichever repo the URL moved to.
    expect(shell).not.toContain("useParams");
    expect(shell).toContain("owner: string;");
    expect(shell).toContain("repoParam: string;");
    expect(layout).toContain("owner={entry.owner}");
    expect(layout).toContain("repoParam={entry.repoParam}");
  });

  test("each shell carries its own passive RepoProvider", () => {
    expect(shell).toContain(
      "<RepoProvider owner={owner} repoParam={repoParam} passive>",
    );
  });

  test("only the visible shell may redirect", () => {
    const redirectAt = shell.indexOf("<SimpleViewSandboxRedirect");
    expect(redirectAt, "the simple-view redirect moved").toBeGreaterThan(-1);
    const guard = shell.lastIndexOf("isActiveRoute ?", redirectAt);
    expect(guard, "a hidden shell would hijack the URL").toBeGreaterThan(-1);
    // The redirect targets the cached repo, never the URL's.
    expect(shell).toContain("params={{ owner, repo: repoParam, numId }}");
  });

  test("the mounted shell count stays capped", () => {
    // Each shell holds a Preview iframe and PTY connections.
    expect(layout).toMatch(/MAX_CACHED_SESSIONS = \d+/);
    expect(layout.replace(/\s+/g, " ")).toMatch(
      /slice\( ?0, MAX_CACHED_SESSIONS/,
    );
  });
});

/**
 * `passive` is what makes a background RepoProvider safe: it resolves the repo
 * for its subtree but never drives navigation and never renders anything the
 * user could act on. A missing repo used to redirect to /home, which is why
 * this once guarded two navigation effects; it now renders `RepoNotFound`
 * instead, so the second guard moved into the load-state resolver.
 */
describe("a passive RepoProvider stays inert", () => {
  test("every navigation effect bails out when passive", () => {
    const effects = repoContext
      .split("useEffect(() => {")
      .slice(1)
      .filter((body) => body.includes("navigate({"));
    // Only URL canonicalization navigates now. A second one appearing here
    // without its own guard is the regression this counts against.
    expect(effects, "the RepoProvider navigation effects moved").toHaveLength(
      1,
    );
    for (const body of effects) {
      const bailAt = body.indexOf("if (passive) return;");
      expect(
        bailAt,
        "a background repo could hijack navigation",
      ).toBeGreaterThan(-1);
      expect(bailAt).toBeLessThan(body.indexOf("navigate({"));
    }
  });

  /**
   * The not-found screen is the other thing a hidden shell must not do: three
   * session shells stay mounted at once, so a background repo the viewer cannot
   * read would otherwise explain itself over the session they are looking at.
   */
  test("a missing repo leaves passive trees on the pending state", () => {
    expect(
      repoContext.replace(/\s+/g, " "),
      "a hidden shell would render RepoNotFound over the visible session",
    ).toContain("return passive ? PENDING");
  });

  test("passive defaults to false, so routed trees keep canonicalizing", () => {
    expect(repoContext).toContain("passive = false");
  });
});

/**
 * Slash-form `basePath` (`/owner/repo/app/…`) does not match the route tree
 * (`/owner/repo--app/…`). Chat View diff / file rows and the Review rail
 * all have to use typed paths + the cached `repoParam`.
 */
describe("session sandbox navigations match the route tree", () => {
  test("Review diffs and tab changes use typed routes against the cached repo", () => {
    expect(shell).toContain(
      'to: "/$owner/$repo/sessions/$numId/review/diffs/$diffView"',
    );
    expect(shell).toContain('to: "/$owner/$repo/sessions/$numId/$sandboxTab"');
    expect(shell).toContain("repo: repoParam");
    expect(shell).not.toContain("${basePath}/sessions/${numId}/review");
  });
});

function read(relativePath: string): string {
  return readFileSync(join(here, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}
