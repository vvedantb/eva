import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = (path: string): string =>
  readFileSync(join(repoRoot, path), "utf8");

test("session lists derive execution from open Turns with a versioned rollout bridge", () => {
  const queries = source("packages/backend/convex/_sessions/queries.ts");
  const projection = source(
    "packages/backend/convex/_chat/turnProjection.ts",
  );
  // The open-Turn lookup and the legacy bridge both live in the projection
  // leaf now, so the MCP entity tools answer "is it running" the same way the
  // sidebar does instead of keying off `activeWorkflowId` on their own.
  expect(queries).toContain("sessionIsExecuting(session, openSessionIds)");
  expect(queries).toContain("openSessionIdsForRepo(ctx.db, args.repoId)");
  expect(projection).toContain('.withIndex("by_repo_open"');
  expect(projection).toContain('q.eq("repoId", repoId).eq("open", true)');
  expect(projection).toContain("isLegacySessionExecuting(session)");
  expect(projection).toContain("session.turnLifecycleVersion === undefined");
  expect(projection).toContain("session.activeWorkflowId !== undefined");
});

// The query, not the hook that wraps it: cached session shells read through
// `useHeldQuery(..., isRouteActive ? args : "skip")`, so pinning `useQuery(`
// here would break on the wrapper rather than on the contract.
test("the session composer uses persisted turn status after query load", () => {
  const hook = source(
    "apps/web/src/routes/_repo/$owner/$repo/sessions/_components/useSessionSend.ts",
  );
  expect(hook).toContain("api.turns.getSessionStatus");
  expect(hook).toContain("turnStatus === undefined");
  expect(hook).toContain(": turnStatus !== null");
});

test("annotation sends share the same canonical turn projection", () => {
  const hook = source(
    "apps/web/src/routes/_repo/$owner/$repo/sessions/_components/useSessionAnnotationSend.ts",
  );
  expect(hook).toContain("api.turns.getSessionStatus");
  expect(hook).toContain(": turnStatus !== null");
});
