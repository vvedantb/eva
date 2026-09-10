import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  buildTestGenBranchName,
  EVA_BRANCH_PREFIX,
} from "../convex/_git/branchNames";
import { isEvaOwnedBranch } from "../convex/_sandbox_runtime/divergedPublish";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(backendDir, "../..");

/**
 * `eva/` is load-bearing in four places that never see each other, and a
 * branch outside the prefix fails all four while type-checking and publishing
 * perfectly:
 *
 *  - Vercel's `git.deploymentEnabled` (root and `apps/web/vercel.json`, fix
 *    fb33487b8) stops one production build per push per agent branch.
 *  - `persistTurnWork` pushes a turn's uncommitted work only on an eva-owned
 *    branch; off-prefix, a sandbox VM that dies mid-turn erases the work.
 *  - `turnCheckpoint` (fix 46e4b84fc) checkpoints only on an eva-owned branch.
 *  - `isEvaOwnedBranch` gates the force-push recovery (fix 0f2004686), so an
 *    off-prefix branch can never recover from a rewritten local history.
 *
 * `testGenWorkflow` published `tests/doc-<slug>` and was missing all four.
 */
describe("every branch Eva publishes stays under the eva/ prefix", () => {
  test("the builders agree on the prefix", () => {
    // The automation and project builders' exact output is pinned in
    // automationRunBranchName.test.ts; those shapes are repeated here only to
    // be run past the predicate the publish path actually asks.
    const built = [
      "eva/automation-mh7automation0000000000001-mh7run001",
      "eva/project-mh7project0000000000000001",
      "eva/project-mh7project0000000000000001-v3",
      buildTestGenBranchName("Mention documents in the session prompt input"),
    ];
    for (const name of built) {
      expect(name.startsWith(EVA_BRANCH_PREFIX), name).toBe(true);
      expect(isEvaOwnedBranch(name), name).toBe(true);
    }
    expect(buildTestGenBranchName("A Feature!")).toBe(
      "eva/tests-doc-a-feature",
    );
    // An empty slug must not collapse into the prefix itself.
    expect(buildTestGenBranchName("!!!")).toBe("eva/tests-doc-untitled");
  });

  test("branches Eva does not own are refused", () => {
    for (const name of [
      "main",
      "staging",
      "develop",
      "tests/doc-a",
      "evax/y",
    ]) {
      expect(isEvaOwnedBranch(name), name).toBe(false);
    }
  });

  test("no branch literal in the backend escapes the prefix", () => {
    // Matches a namespaced literal whose second segment names an Eva entity —
    // `eva/task-${…}`, and the `tests/doc-${…}` shape that regressed. Paths
    // like `origin/${branch}` interpolate immediately and are not branch
    // namespaces, so they do not match.
    const branchLiteral =
      /`([a-z][a-z0-9-]*)\/(?:task|session|project|automation|tests|doc|eval)[a-z0-9-]*\$\{/gi;
    const offenders: string[] = [];
    for (const file of backendSources()) {
      const source = withoutComments(readFileSync(file, "utf8"));
      for (const match of source.matchAll(branchLiteral)) {
        if (`${match[1]}/` !== EVA_BRANCH_PREFIX) {
          offenders.push(`${file.slice(backendDir.length + 1)}: ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the shared builders interpolate the constant rather than retyping it", () => {
    const builders = withoutComments(
      readFileSync(join(backendDir, "convex/_git/branchNames.ts"), "utf8"),
    );
    expect(builders).not.toMatch(/`eva\//);
    expect(builders.match(/\$\{EVA_BRANCH_PREFIX\}/g)?.length).toBe(4);
  });
});

/**
 * Vercel is configured by glob, the runtime by prefix check. Both are pinned to
 * `EVA_BRANCH_PREFIX` here because a rename that updates only one side leaves
 * either every agent branch deploying or every agent turn unprotected.
 */
describe("the eva/ gates outside the builders", () => {
  test("both Vercel configs disable git deployments for the prefix", () => {
    for (const config of ["vercel.json", "apps/web/vercel.json"]) {
      const parsed = JSON.parse(readFileSync(join(repoRoot, config), "utf8"));
      expect(parsed, config).toMatchObject({
        git: { deploymentEnabled: {} },
      });
      const patterns = Object.entries(parsed.git.deploymentEnabled);
      const disabled = patterns
        .filter(([, enabled]) => enabled === false)
        .map(([pattern]) => pattern.replace(/\*+$/, ""));
      // Strip the glob suffix so the pattern is compared as a prefix: a rename
      // to `agent/**` would keep matching a glob assertion but stops matching
      // the names the builders produce.
      expect(disabled, config).toContain(EVA_BRANCH_PREFIX);
    }
  });

  test("the sandbox runtime gates test the same prefix", () => {
    const gates = [
      "callback-src/runtime/turnPersist.ts",
      "callback-src/runtime/turnCheckpoint.ts",
      "convex/_sandbox_runtime/divergedPublish.ts",
    ];
    for (const gate of gates) {
      const source = readFileSync(join(backendDir, gate), "utf8");
      expect(source, gate).toContain(`startsWith("${EVA_BRANCH_PREFIX}")`);
    }
  });
});

/** Prose about these branch names is everywhere; only code counts here. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Hand-written backend TypeScript: no generated bundles, no tests. */
function backendSources(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_generated" || entry.name === "tests") continue;
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".generated.ts")) continue;
      files.push(path);
    }
  };
  walk(join(backendDir, "convex"));
  walk(join(backendDir, "callback-src"));
  return files;
}
