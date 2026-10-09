import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

/**
 * An unanswered `pendingQuestions` row hides the chat composer. Stopping a
 * sandbox kills the paused turn, so the question can never be claimed — leaving
 * the row behind deadlocks the composer with no card to answer.
 *
 * Every entity kind that owns a sandbox has to clear on stop, so this asserts
 * all three teardown paths call the helper rather than only the one that got
 * reported.
 */
test("every sandbox stop path clears pending questions", () => {
  const paths = [
    "../convex/_sessions/sandbox.ts",
    "../convex/_agentTasks/sandbox.ts",
    "../convex/_projects/sandbox.ts",
  ];
  for (const path of paths) {
    const source = readFileSync(join(testsDir, path), "utf8");
    expect(source, `${path} must clear pending questions on stop`).toMatch(
      /clearPendingQuestionsForEntity\(\s*ctx\.db,/,
    );
  }
});

/**
 * A session's sandbox is shared by every one of its chats, and each chat's
 * turn keys its own pendingQuestions row, so the session stop has to clear
 * every live chat — clearing only Main would leave a parallel chat's composer
 * hidden.
 */
test("the session stop clears every live chat's pending questions", () => {
  const source = readFileSync(
    join(testsDir, "../convex/_sessions/sandbox.ts"),
    "utf8",
  );
  const stopAt = source.indexOf(
    "export async function requestSessionSandboxStop(",
  );
  expect(stopAt).toBeGreaterThan(-1);
  const body = source.slice(stopAt, source.indexOf("\n}", stopAt));
  const listAt = body.indexOf("await listLiveSessionChats(ctx.db, sessionId)");
  const clearAt = body.indexOf("clearPendingQuestionsForEntity(");
  expect(listAt, "the stop must enumerate the live chats").toBeGreaterThan(-1);
  expect(clearAt).toBeGreaterThan(listAt);
  expect(body).toContain("sessionChatStreamingEntityId(chat._id)");
});

/**
 * The teardown paths reach for the plain helper, not the `internalMutation`
 * wrapper — they already hold a mutation ctx, and a nested call would be a
 * needless scheduler hop.
 */
test("pendingQuestions exports the helper the teardown paths import", () => {
  const source = readFileSync(
    join(testsDir, "../convex/pendingQuestions.ts"),
    "utf8",
  );
  expect(source).toContain(
    "export async function clearPendingQuestionsForEntity",
  );
});
