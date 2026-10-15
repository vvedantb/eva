import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

function readSource(relative: string): string {
  return readFileSync(join(convexDir, relative), "utf8");
}

const chatResult = readSource("_chat/chatResult.ts");
const cancelRace = readSource("_chat/cancelRace.ts");
const sessionWorkflow = readSource("_sessions/workflow.ts");
const sessionExecution = readSource("_sessions/execution.ts");
const taskChatWorkflow = readSource("agentTaskChatWorkflow.ts");
const projectChatWorkflow = readSource("projectChatWorkflow.ts");

const SAVE_RESULT_SOURCES = [
  ["session", sessionWorkflow],
  ["task chat", taskChatWorkflow],
  ["project chat", projectChatWorkflow],
] as const;

/**
 * Same class of guard as `chatSurfaceUnificationContract`: the three
 * saveResult handlers must not re-grow their own publish-failure / targeting
 * copies. The one true write path lives in `_chat/chatResult.ts`.
 */
describe("chat saveResult handlers only orchestrate through applyChatTurnResult", () => {
  test.each(SAVE_RESULT_SOURCES)(
    "%s saveResult does not itself insert the publish-failure alert or target messages",
    (_label, source) => {
      const startAt = source.indexOf("export const saveResult =");
      expect(startAt, "saveResult moved or was renamed").toBeGreaterThan(-1);
      const endAt = source.indexOf("\n});", startAt);
      const body = source.slice(startAt, endAt < 0 ? undefined : endAt);
      expect(body).toContain("applyChatTurnResult(");
      expect(body).not.toContain("delayedPublishFailureError(");
      expect(body).not.toContain("resultTargetMessage(");
      expect(body).not.toContain("orphanPlaceholderMessages(");
      expect(body).not.toContain("isSystemAlert: true");
    },
  );
});

test("the three cancel paths share finalizeOpenSyntheticTurnOnCancel", () => {
  expect(chatResult).toContain(
    "export async function finalizeOpenSyntheticTurnOnCancel(",
  );
  expect(cancelRace, "cancelChatTurn lost the shared cancel helper").toContain(
    "finalizeOpenSyntheticTurnOnCancel(",
  );
  for (const [label, source] of [
    ["session", sessionExecution],
    ["task chat", taskChatWorkflow],
    ["project chat", projectChatWorkflow],
  ] as const) {
    expect(source, `${label} lost the shared cancelChatTurn`).toContain(
      "cancelChatTurn(",
    );
    expect(source, `${label} re-inlined the cancel finalize`).not.toContain(
      "finalizeOpenSyntheticTurnOnCancel(",
    );
  }
});

test("stall, session hygiene and session stop paths share finalizeOpenSyntheticTurnOnCancel", () => {
  for (const [label, source] of [
    ["stall watchdog", readSource("_chat/stallWatchdog.ts")],
    ["session workflow", sessionWorkflow],
    ["session sandbox", readSource("_sessions/sandbox.ts")],
  ] as const) {
    expect(source, `${label} lost the shared helper`).toContain(
      "finalizeOpenSyntheticTurnOnCancel(",
    );
    expect(source, `${label} redefined the shared helper`).not.toContain(
      "async function finalizeOpenSyntheticTurn",
    );
  }
});

test("applyChatTurnResult is the only place that writes the reply patch", () => {
  const matches = chatResult.match(
    /export async function writeAssistantTurnResult/g,
  );
  expect(matches).toHaveLength(1);
});

test("the three addAssistantPlaceholder handlers share insertAssistantPlaceholderIfNeeded", () => {
  expect(chatResult).toContain(
    "export async function insertAssistantPlaceholderIfNeeded(",
  );
  for (const [label, source] of SAVE_RESULT_SOURCES) {
    const startAt = source.indexOf("export const addAssistantPlaceholder =");
    expect(startAt, `${label} addAssistantPlaceholder moved`).toBeGreaterThan(
      -1,
    );
    const endAt = source.indexOf("\n});", startAt);
    const body = source.slice(startAt, endAt < 0 ? undefined : endAt);
    expect(body, `${label} lost the shared placeholder helper`).toContain(
      "insertAssistantPlaceholderIfNeeded(",
    );
    expect(body, `${label} grew a local placeholder insert`).not.toContain(
      'ctx.db.insert("messages"',
    );
  }
});
