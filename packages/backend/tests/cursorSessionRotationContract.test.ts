import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = read("convex/_sessions/workflow.ts");
const callbackBundle = read(
  "convex/_sandbox_runtime/callbackScript.generated.ts",
);

const sessionPrep: [string, string][] = [
  ["claude", read("callback-src/session/claudeSession.ts")],
  ["codex", read("callback-src/session/codexSession.ts")],
  ["opencode", read("callback-src/session/opencodeSession.ts")],
  ["cursor", read("callback-src/session/cursorSession.ts")],
];

const sizeBasedRotationMarkers = [
  "shouldRotateCursorSession",
  "shouldRotateClaudeSession",
  "shouldRotateCodexSession",
  "shouldRotateOpencodeSession",
  "CURSOR_MAX_RESUME_CONTEXT_TOKENS",
  "rotating saved Cursor agent",
];

describe("saved provider sessions are resumed, not rotated on context size", () => {
  test.each(sessionPrep)(
    "%s session prep never consults a token/turn rotation policy",
    (_label, source) => {
      for (const marker of sizeBasedRotationMarkers) {
        expect(source).not.toContain(marker);
      }
    },
  );

  test("the deployed callback bundle has no size-based rotation policy", () => {
    for (const marker of sizeBasedRotationMarkers) {
      expect(callbackBundle).not.toContain(marker);
    }
  });

  test("claude resumes a persisted session id when its transcript exists", () => {
    const [, source] = sessionPrep[0];
    expect(source).toContain(
      'return { mode: "resume", sessionId: persistedState.resumeSessionId }',
    );
  });

  test("codex resumes a persisted thread id", () => {
    const [, source] = sessionPrep[1];
    expect(source).toContain(
      "return persistedState && persistedState.resumeThreadId",
    );
    expect(source).toContain(
      '{ mode: "resume", sessionId: persistedState.resumeThreadId }',
    );
  });

  test("opencode resumes a persisted session id", () => {
    const [, source] = sessionPrep[2];
    expect(source).toContain(
      'return { mode: "resume", sessionId: persistedState.resumeSessionId }',
    );
  });

  test("cursor resumes a persisted agent id", () => {
    const [, source] = sessionPrep[3];
    expect(source).toContain(
      'return { mode: "resume", sessionId: persistedState.resumeSessionId }',
    );
  });

  test("a stalled cursor resume retries the same agent and never mints a replacement", () => {
    const cursorSdk = read("callback-src/providers/cursorSdk.ts");
    for (const source of [cursorSdk, callbackBundle]) {
      expect(source).toContain("Retrying the saved Cursor agent");
      // In-place compaction counts as liveness, never as a stall to rotate on.
      expect(source).toContain("compactionInFlight");
      expect(source).toContain("canReplaceCursorAgent");
      // Stall-twice used to fall through to createFreshAgent and persist a
      // blank id. That notice must stay gone so a slow resume cannot rotate.
      expect(source).not.toContain(
        "The saved agent stopped responding twice, so Eva recovered with a clean context.",
      );
    }
  });
});

describe("session prompts do not dump a Cursor conversation handoff", () => {
  test("the workflow no longer selects prior Cursor history", () => {
    expect(workflow).not.toContain("usesCursorConversationHandoff");
    expect(workflow).not.toContain("priorCursorHistory");
    expect(workflow).not.toContain("./cursorContext");
  });
});

function read(relativePath: string): string {
  return readFileSync(join(backendDir, relativePath), "utf8")
    .replaceAll("\r\n", "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
