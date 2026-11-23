import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test, vi } from "bun:test";

// Runtime homes live under /tmp and die with the sandbox; persist dirs survive
// it. Both point into one throwaway root so the test never touches /home/eva.
const sandbox = { root: mkdtempSync(join(tmpdir(), "session-resume-")) };

const original = { ...(await import("../config.js")) };
mock.module("../config.js", () => {
  const runtime = (provider: string): string =>
    sandbox.root + "/runtime/" + provider;
  const persist = (provider: string): string =>
    sandbox.root + "/persist/" + provider;
  return {
    ...original,
    CODEX_RUNTIME_HOME_DIR: runtime("codex"),
    CODEX_PERSIST_DIR: persist("codex"),
    CODEX_LOCAL_STATE_FILE: runtime("codex") + "/session-state.json",
    CODEX_PERSIST_STATE_FILE: persist("codex") + "/session-state.json",
    CODEX_AUTH_FILE: runtime("codex") + "/auth.json",
    CODEX_PERSIST_AUTH_FILE: persist("codex") + "/auth.json",
    OPENCODE_RUNTIME_HOME_DIR: runtime("opencode"),
    OPENCODE_PERSIST_DIR: persist("opencode"),
    OPENCODE_LOCAL_STATE_FILE: runtime("opencode") + "/session-state.json",
    OPENCODE_PERSIST_STATE_FILE: persist("opencode") + "/session-state.json",
    OPENCODE_AUTH_DIR: runtime("opencode-auth"),
    OPENCODE_AUTH_FILE: runtime("opencode-auth") + "/auth.json",
    OPENCODE_PERSIST_AUTH_FILE: persist("opencode") + "/auth.json",
    CURSOR_RUNTIME_HOME_DIR: runtime("cursor"),
    CURSOR_PERSIST_DIR: persist("cursor"),
    CURSOR_LOCAL_STATE_FILE: runtime("cursor") + "/session-state.json",
    CURSOR_PERSIST_STATE_FILE: persist("cursor") + "/session-state.json",
  };
});

const { callbackState: S, resetStateForTests } = await import(
  "../runtime/state.js"
);
const { prepareCodexSessionState, syncCodexStateToPersist } = await import(
  "../session/codexSession.js"
);
const { prepareCursorSessionState, syncCursorStateToPersist } = await import(
  "../session/cursorSession.js"
);
const { prepareOpencodeSessionState, syncOpencodeStateToPersist } =
  await import("../session/opencodeSession.js");

const providers = [
  {
    name: "codex",
    endTurn: (id: string) => {
      S.activeCodexThreadId = id;
      syncCodexStateToPersist();
    },
    prepare: prepareCodexSessionState,
  },
  {
    name: "cursor",
    endTurn: (id: string) => {
      S.activeCursorSessionId = id;
      syncCursorStateToPersist();
    },
    prepare: prepareCursorSessionState,
  },
  {
    name: "opencode",
    endTurn: (id: string) => {
      S.activeOpencodeSessionId = id;
      syncOpencodeStateToPersist();
    },
    prepare: prepareOpencodeSessionState,
  },
];

/** A sandbox restart: /tmp is gone and the process state starts empty. */
function restartSandbox(): void {
  rmSync(sandbox.root + "/runtime", { recursive: true, force: true });
  resetStateForTests();
}

beforeEach(() => {
  rmSync(sandbox.root, { recursive: true, force: true });
  resetStateForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(providers)("$name session across a sandbox restart", (p) => {
  test("resumes the session the last turn persisted", () => {
    p.endTurn("session-from-last-turn");
    restartSandbox();

    expect(p.prepare()).toEqual({
      mode: "resume",
      sessionId: "session-from-last-turn",
    });
  });

  test("starts fresh when nothing was persisted", () => {
    expect(p.prepare()).toEqual({ mode: "none", sessionId: null });
  });

  test("starts fresh when the persisted state is corrupt", () => {
    mkdirSync(sandbox.root + "/persist/" + p.name, { recursive: true });
    writeFileSync(
      sandbox.root + "/persist/" + p.name + "/session-state.json",
      "{not json",
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(p.prepare()).toEqual({ mode: "none", sessionId: null });
  });
});
