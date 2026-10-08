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
  // Called directly or through a per-repo helper (#916); either way it reads
  // the open-Turn set from the database for one repo at a time.
  expect(queries).toMatch(/openChatEntityIdsForRepo\(\s*(?:ctx\.)?db,/);
  expect(projection).toContain('.withIndex("by_repo_open"');
  expect(projection).toContain('q.eq("repoId", repoId).eq("open", true)');
  expect(projection).toContain("isLegacySessionExecuting(session)");
  expect(projection).toContain("session.turnLifecycleVersion === undefined");
  expect(projection).toContain("session.activeWorkflowId !== undefined");
});

/**
 * Task and project chats read the same open-Turn set, with their own bridge
 * on `chatTurnLifecycleVersion`. A synthetic turn never sets
 * `activeChatWorkflowId`, so keying off that field alone showed it as idle.
 */
test("task and project readers derive execution from open Turns", () => {
  const projection = source(
    "packages/backend/convex/_chat/turnProjection.ts",
  );
  expect(projection).toContain("entity.chatTurnLifecycleVersion === undefined");
  expect(projection).toContain("chatTurnIsOpen(task, openChatEntityIds)");
  expect(projection).toContain("chatTurnIsOpen(project, openChatEntityIds)");
  // Decision 3: one sandbox-busy status covers the task's main run too.
  expect(projection).toContain("task.activeWorkflowId !== undefined ||");

  const taskQueries = source("packages/backend/convex/_agentTasks/queries.ts");
  expect(taskQueries).toContain("taskIsExecuting(task, openChatEntityIds)");
  const idle = source("packages/backend/convex/sandboxIdlePause.ts");
  expect(idle).not.toContain("activeChatWorkflowId");

  for (const path of [
    "apps/web/src/lib/components/tasks/TaskSandboxChatPanel.tsx",
    "apps/web/src/lib/components/projects/ProjectSandboxChatPanel.tsx",
    "apps/web/src/routes/_repo/$owner/$repo/projects/ProjectDetailClient.tsx",
    "apps/web/src/lib/components/tasks/_components/TaskFooter.tsx",
  ]) {
    expect(source(path), path).not.toContain("activeChatWorkflowId");
  }
  const hook = source("apps/web/src/lib/components/chat/useChatTurnOpen.ts");
  expect(hook).toContain("api.turns.getChatStatus");
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
