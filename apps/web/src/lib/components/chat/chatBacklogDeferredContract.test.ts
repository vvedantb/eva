import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const chatBody = read("./ChatBody.tsx");
const chatMessage = read("./ChatMessage.tsx");
const checkpointActions = read("./_components/useTurnCheckpointActions.tsx");

/**
 * Regression (fix #808): opening a long chat committed every settled turn in
 * one blocking render — roughly a second of locked main thread on a heavy
 * transcript, so switching sessions felt frozen. Three things fixed it, and
 * each one is a plain code shape that a refactor can undo without any visible
 * failure until someone opens an 80-turn chat on a slow machine. Nothing else
 * in the suite measures render cost, so pin the shapes.
 */
describe("a long transcript commits its backlog off the first paint", () => {
  test("the backlog waits for a deferred pass", () => {
    expect(chatBody).toContain("useDeferredValue");
    const derivation = chatBody.match(/const backlogReady =\s*([^;]+);/);
    expect(derivation, "the backlog gate moved or was renamed").not.toBeNull();
    const expression = derivation?.[1] ?? "";
    // Deferring "the transcript has rows", not mount: a chat whose messages
    // arrive after mount would otherwise spend its deferred pass on the
    // spinner and commit the whole backlog in the render that first has data.
    expect(expression).toContain("displayMessages.length > 0");
    expect(
      expression,
      "without an initial value the first pass renders the backlog anyway",
    ).toContain("false");
  });

  test("only the rows above the last turn are gated", () => {
    const gateAt = chatBody.indexOf("{backlogReady");
    expect(gateAt, "the backlog gate is no longer rendered").toBeGreaterThan(-1);
    expect(chatBody).toContain("renderMessage(message, true)");
    // The last turn is the one in the viewport — it must never be deferred.
    const lastTurnAt = chatBody.indexOf("<ChatLastTurn>");
    expect(lastTurnAt).toBeGreaterThan(-1);
    const lastTurnBlock = chatBody.slice(
      lastTurnAt,
      chatBody.indexOf("</ChatLastTurn>", lastTurnAt),
    );
    expect(lastTurnBlock).toContain("renderMessage(message)");
    expect(
      lastTurnBlock,
      "the visible turn must not wait for the deferred pass",
    ).not.toContain("backlogReady");
  });

  test("backlog rows skip their enter animation", () => {
    expect(chatBody).toContain("animateIn={!isBacklog}");
    // 80 simultaneous enter animations is the costliest part of the commit,
    // and wrong besides: nothing arrived, the user scrolled past it already.
    // `false`, not a zero-offset object: motion still runs the animation when
    // `initial` is any variant, so the backlog branch has to opt out entirely.
    expect(chatMessage).toContain(
      "initial={animateIn ? { opacity: 0, y: 10 } : false}",
    );
  });

  test("the jump rail mounts with the backlog it measures", () => {
    // It resolves its ticks by querying `[data-message-id]` from an effect
    // keyed on the tick array, so binding it before those rows exist observes
    // nothing and never retries.
    expect(chatBody).toMatch(/backlogReady \? <ChatJumpRail/);
  });

  test("turn checkpoint dialogs are built on first open", () => {
    // Every code-changing turn owns two Radix dialog roots; mounting them up
    // front meant hundreds of them to show none.
    expect(checkpointActions).toContain("const dialogs = !dialogsMounted");
    const openers = checkpointActions.match(/setDialogsMounted\(true\)/g) ?? [];
    expect(
      openers.length,
      "both the diff and the restore opener have to latch the mount",
    ).toBe(2);
    // Latched, never cleared, so closing keeps its exit animation.
    expect(checkpointActions).not.toContain("setDialogsMounted(false)");
  });
});

function read(relativePath: string): string {
  return readFileSync(join(here, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}
