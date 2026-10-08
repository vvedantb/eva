import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = (path: string): string =>
  readFileSync(join(repoRoot, path), "utf8");

/**
 * A session is "executing" when any of its chats has an open Turn. The list
 * query derives that from one indexed read of `turns` per repo, grouped by the
 * turn's `sessionId`, and never from `activeWorkflowId` or a per-session
 * version bridge — those legacy fields are gone with the chat refactor.
 */
test("session lists derive execution from open Turns grouped by session", () => {
  const queries = source("packages/backend/convex/_sessions/queries.ts");
  expect(queries).toContain('.withIndex("by_repo_open"');
  expect(queries).toContain('q.eq("repoId", repoId).eq("open", true)');
  expect(queries).toContain("turn.sessionId !== undefined");
  expect(queries).toContain("isExecuting: runningChats > 0");
  expect(queries).not.toContain("isLegacySessionExecuting");
  expect(queries).not.toContain("turnLifecycleVersion");
  expect(queries).not.toContain("activeWorkflowId");
  expect(
    existsSync(join(repoRoot, "packages/backend/convex/_chat/turnProjection.ts")),
    "the legacy projection bridge was removed with the chat refactor",
  ).toBe(false);
});

test("the chat composer uses persisted turn status after query load", () => {
  const hook = source(
    "apps/web/src/routes/_repo/$owner/$repo/sessions/_components/useChatSend.ts",
  );
  expect(hook).toContain("useQuery(api.turns.getChatStatus, { chatId })");
  expect(hook).toContain("turnStatus === undefined");
  expect(hook).toContain(": turnStatus !== null");
});

test("annotation sends share the same canonical turn projection", () => {
  const hook = source(
    "apps/web/src/routes/_repo/$owner/$repo/sessions/_components/useSessionAnnotationSend.ts",
  );
  expect(hook).toContain("useQuery(api.turns.getChatStatus, { chatId })");
  expect(hook).toContain(": turnStatus !== null");
});
