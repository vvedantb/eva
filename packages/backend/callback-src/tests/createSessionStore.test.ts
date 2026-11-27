import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "bun:test";
import { createSessionStore } from "../session/createSessionStore.js";

function storePaths(dir: string) {
  return {
    runtimeHomeDir: dir + "/runtime",
    persistDir: dir + "/persist",
    localStateFile: dir + "/runtime/session-state.json",
    persistStateFile: dir + "/persist/session-state.json",
  };
}

test("createSessionStore reads and writes resume id", () => {
  const dir = mkdtempSync(join(tmpdir(), "session-store-"));
  let activeId = "";
  const store = createSessionStore({
    ...storePaths(dir),
    resumeField: "resumeSessionId",
    getActiveId: () => activeId,
  });

  expect(store.readSessionState()).toBe(null);
  activeId = "sess-123";
  store.writeSessionState();
  expect(store.readSessionState()).toEqual({ resumeSessionId: "sess-123" });
});

test("readSessionState prefers local state and falls back to the persist copy", () => {
  const dir = mkdtempSync(join(tmpdir(), "session-store-"));
  const paths = storePaths(dir);
  mkdirSync(paths.runtimeHomeDir, { recursive: true });
  mkdirSync(paths.persistDir, { recursive: true });
  writeFileSync(
    paths.localStateFile,
    JSON.stringify({ resumeThreadId: "thread-local" }),
  );
  writeFileSync(
    paths.persistStateFile,
    JSON.stringify({ resumeThreadId: "thread-persisted" }),
  );
  const store = createSessionStore({
    ...paths,
    resumeField: "resumeThreadId",
    getActiveId: () => "",
  });

  expect(store.readSessionState()).toEqual({ resumeThreadId: "thread-local" });
  rmSync(paths.localStateFile);
  expect(store.readSessionState()).toEqual({
    resumeThreadId: "thread-persisted",
  });
});
