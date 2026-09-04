import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

function readSource(relative: string): string {
  return readFileSync(join(convexDir, relative), "utf8");
}

function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const endAt = source.indexOf("\n}", startAt);
  return source.slice(startAt, endAt < 0 ? undefined : endAt);
}

/**
 * The banner reacts to the failure class, so the stamp must stay on the shared
 * write path and must reuse the one matcher in `_taskWorkflow/recovery.ts`.
 */
test("applyChatTurnResult stamps errorType from isUsageLimitError", () => {
  const chatResult = readSource("_chat/chatResult.ts");
  const body = functionBody(
    chatResult,
    "export async function applyChatTurnResult(",
  );
  expect(body).toContain("isUsageLimitError(");
  expect(body).toContain("errorType");
  expect(chatResult).toContain('from "../_taskWorkflow/recovery"');
});

/** Nobody should re-implement turn staging by hand inside the retry path. */
test("retryLastTurnWithAccount reuses the shared staging helpers", () => {
  const execution = readSource("_sessions/execution.ts");
  const startAt = execution.indexOf("export const retryLastTurnWithAccount =");
  expect(startAt, "retryLastTurnWithAccount moved").toBeGreaterThan(-1);
  const endAt = execution.indexOf("\n});", startAt);
  const body = execution.slice(startAt, endAt < 0 ? undefined : endAt);
  expect(body).toContain("stageAndStartSessionTurn(");
  expect(body).toContain("resultTargetMessage(");
  expect(body).toContain('"rate_limit"');
  expect(body).not.toContain("notifyChatMentions(");
});
