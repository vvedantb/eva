import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeAll, expect, test, vi } from "vitest";
import { z } from "zod";
import type { Id } from "@eva/backend";
import type { useNewSessionComposerState as UseComposerState } from "./useNewSessionComposerState";

/**
 * Regression (fix #1011): the new-session composer saved the last model,
 * traits and provider account in localStorage, so a stale pick overrode the
 * repo default on every later visit. Only the prompt draft may persist now;
 * older blobs that still hold model/traits/account must be ignored.
 */

const repoId = z.custom<Id<"githubRepos">>().parse("repo_1");
const storage = new Map<string, string>();

let useComposerState: typeof UseComposerState;

beforeAll(async () => {
  // usehooks-ts decides "server" once at import time, so the fake window must
  // exist before the hook module loads.
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  ({ useNewSessionComposerState: useComposerState } = await import(
    "./useNewSessionComposerState"
  ));
});

function renderComposerState(stored: string) {
  storage.set(`eva:new-session-composer:${repoId}`, stored);
  let result: ReturnType<typeof UseComposerState> | undefined;
  function Probe() {
    result = useComposerState(repoId, "claude:opus", { fastMode: false });
    return null;
  }
  renderToString(createElement(Probe));
  if (!result) throw new Error("hook did not render");
  return result;
}

test("a stored model and traits from an older blob do not override repo defaults", () => {
  const state = renderComposerState(
    JSON.stringify({
      draft: "fix the header",
      model: "claude:haiku",
      fastMode: true,
      providerAccountId: "acct_shared",
    }),
  );
  expect(state.draft).toBe("fix the header");
  expect(state.model).toBe("claude:opus");
  expect(state.displayTraits.fastMode).toBe(false);
  expect(state).not.toHaveProperty("providerAccountId");
});

test("an unreadable stored blob falls back to an empty draft", () => {
  const state = renderComposerState('"legacy plain-string draft"');
  expect(state.draft).toBe("");
  expect(state.model).toBe("claude:opus");
});
