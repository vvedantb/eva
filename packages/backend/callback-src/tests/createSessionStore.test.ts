import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "bun:test";
import { createSessionStore } from "../session/createSessionStore.js";

test("createSessionStore reads and writes resume id", () => {
  const dir = mkdtempSync(join(tmpdir(), "session-store-"));
  let activeId = "";
  const store = createSessionStore({
    runtimeHomeDir: dir + "/runtime",
    persistDir: dir + "/persist",
    localStateFile: dir + "/runtime/session-state.json",
    persistStateFile: dir + "/persist/session-state.json",
    resumeField: "resumeSessionId",
    getActiveId: () => activeId,
    setActiveId: (id) => {
      activeId = id;
    },
  });

  expect(store.readSessionState()).toBe(null);
  activeId = "sess-123";
  store.writeSessionState();
  const read = store.readSessionState();
  expect(read).toBeTruthy();
  if (read) {
    expect(read.resumeSessionId).toBe("sess-123");
  }
});

test("createSessionStore resolveResumeId prefers local state", () => {
  const dir = mkdtempSync(join(tmpdir(), "session-store-"));
  mkdirSync(dir + "/runtime", { recursive: true });
  writeFileSync(
    dir + "/runtime/session-state.json",
    JSON.stringify({ resumeThreadId: "thread-abc", updatedAt: "t" }),
    "utf8",
  );
  const store = createSessionStore({
    runtimeHomeDir: dir + "/runtime",
    persistDir: dir + "/persist",
    localStateFile: dir + "/runtime/session-state.json",
    persistStateFile: dir + "/persist/session-state.json",
    resumeField: "resumeThreadId",
    getActiveId: () => "",
    setActiveId: () => {},
  });
  expect(store.resolveResumeId()).toBe("thread-abc");
});
