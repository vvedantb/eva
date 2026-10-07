import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * `runCursorSdkAttempt`'s body with comments stripped: the prose names the very
 * identifiers these tests count, so an assertion over the raw text would match
 * a comment instead of the code.
 */
const attemptBody = (() => {
  const source = readFileSync(
    join(backendDir, "callback-src/providers/cursorSdk.ts"),
    "utf8",
  )
    .replaceAll("\r\n", "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
  const startAt = source.indexOf("export async function runCursorSdkAttempt(");
  expect(startAt, "runCursorSdkAttempt moved or was renamed").toBeGreaterThan(
    -1,
  );
  const nextAt = source.indexOf("\nexport ", startAt + 1);
  return source.slice(startAt, nextAt < 0 ? undefined : nextAt);
})();

type Range = { readonly start: number; readonly end: number };

/** Every index at which `needle` occurs in `text`. */
function indexesOf(text: string, needle: string): readonly number[] {
  const found: number[] = [];
  for (
    let at = text.indexOf(needle);
    at > -1;
    at = text.indexOf(needle, at + 1)
  ) {
    found.push(at);
  }
  return found;
}

/** The balanced `open`/`close` span that begins at the first `open` past `from`. */
function balancedSpan(
  text: string,
  from: number,
  open: string,
  close: string,
): Range {
  const start = text.indexOf(open, from);
  expect(start, `no ${open} follows index ${from}`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error(`unbalanced ${open}${close}`);
}

const contains = (range: Range, at: number): boolean =>
  at >= range.start && at < range.end;

/** Every `catch (…) { … }` body in the attempt, outermost ones included. */
const catchBlocks: readonly Range[] = indexesOf(attemptBody, "catch (").map(
  (at) =>
    balancedSpan(
      attemptBody,
      balancedSpan(attemptBody, at, "(", ")").end,
      "{",
      "}",
    ),
);

/** Every `if (…canReplaceCursorAgent…) { … }` body in the attempt. */
const replaceGuardedBlocks: readonly Range[] = indexesOf(attemptBody, "if (")
  .map((at) => balancedSpan(attemptBody, at, "(", ")"))
  .filter((condition) =>
    attemptBody
      .slice(condition.start, condition.end)
      .includes("canReplaceCursorAgent"),
  )
  .map((condition) => balancedSpan(attemptBody, condition.end, "{", "}"));

const freshAgentCalls: readonly number[] = indexesOf(
  attemptBody,
  "createFreshAgent()",
);

/**
 * `createFreshAgent` ends in `persistAgentId(created.agentId)`, so minting one
 * overwrites the session's saved agent id and every later turn resumes a blank
 * conversation. In prod (session 174, 3 Sep 2026) a resumed grok-4.6 xhigh turn
 * simply thought for more than the old 60s pre-output budget, and the stall
 * recovery replaced the agent — the "fresh" agent then answered instantly
 * because it had no context.
 *
 * The fix made a stall reopen the SAME agent and fail the turn on a second
 * stall: `canReplaceCursorAgent` (an `agent_not_found`, i.e. the store really
 * is gone) is now the ONLY licence to create. That is a call-site property, not
 * a predicate one, and re-adding a bare `createFreshAgent()` fallback in a
 * `catch` would restore the amnesia silently.
 */
describe("a failing Cursor turn may only replace the agent when the store is gone", () => {
  test("the attempt still creates, resumes and recovers", () => {
    expect(freshAgentCalls.length).toBeGreaterThan(1);
    expect(catchBlocks.length).toBeGreaterThan(0);
    expect(replaceGuardedBlocks.length).toBeGreaterThan(0);
  });

  test("every fresh agent reached from a failure sits behind canReplaceCursorAgent", () => {
    const fromFailure = freshAgentCalls.filter((at) =>
      catchBlocks.some((block) => contains(block, at)),
    );
    // The one unguarded creation is the first turn of a session, which has no
    // saved agent to lose; it is not in a catch.
    expect(
      fromFailure.length,
      "no recovery path creates an agent any more — did the recovery move?",
    ).toBeGreaterThan(0);
    for (const at of fromFailure) {
      expect(
        replaceGuardedBlocks.some((block) => contains(block, at)),
        `createFreshAgent() at offset ${at} is reachable from a catch without a canReplaceCursorAgent guard: a stalled resume would mint a blank agent and wipe the session`,
      ).toBe(true);
    }
  });

  test("a stall is recovered by reopening the saved agent, not by creating one", () => {
    const stallGuards = indexesOf(
      attemptBody,
      "shouldRetryStalledCursorResume(",
    );
    expect(
      stallGuards.length,
      "the pre-output stall recovery is gone",
    ).toBeGreaterThan(0);
    for (const at of stallGuards) {
      const branch = balancedSpan(
        attemptBody,
        balancedSpan(attemptBody, at, "(", ")").end,
        "{",
        "}",
      );
      expect(
        attemptBody.slice(branch.start, branch.end),
        "the stall branch must reopen the saved agent",
      ).toContain("resumeSavedAgent(");
    }
  });

  test("only createFreshAgent and resumeSavedAgent persist an agent id", () => {
    // Any other writer could save an id the session never resumed against, so
    // the saved id is written in exactly the two places that produced a handle.
    expect(attemptBody).toContain("const persistAgentId = (agentId: string)");
    const persistCalls = indexesOf(attemptBody, "persistAgentId(created");
    const resumeCalls = indexesOf(attemptBody, "persistAgentId(resumed");
    expect(persistCalls.length).toBe(1);
    expect(resumeCalls.length).toBe(1);
    expect(indexesOf(attemptBody, "persistAgentId(").length).toBe(
      persistCalls.length + resumeCalls.length,
    );
  });
});
