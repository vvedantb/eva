import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  isPendingTurnLive,
  isUnclaimedOpenTurn,
} from "../convex/_sessions/pendingTurnRecovery";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

/**
 * A cancel landing while `startExecute` staged the turn wiped `pendingTurn`
 * after the workflow had already started waiting on `sessionComplete`. The
 * daemon then polled an empty session forever and the chat sat on an open
 * bubble (fix 576af8c1, watchdog side in 9bea5f73).
 */
describe("isUnclaimedOpenTurn", () => {
  const open = { role: "assistant" };

  test("an open assistant bubble with nothing pending needs re-staging", () => {
    expect(
      isUnclaimedOpenTurn({ hasPendingTurn: false, lastAssistant: open }),
    ).toBe(true);
  });

  /** The daemon would claim the same turn twice. */
  test("does not re-stage over a live pendingTurn", () => {
    expect(
      isUnclaimedOpenTurn({ hasPendingTurn: true, lastAssistant: open }),
    ).toBe(false);
  });

  /** The reply already landed; re-staging it duplicates the answer. */
  test("does not re-stage a finished bubble", () => {
    expect(
      isUnclaimedOpenTurn({
        hasPendingTurn: false,
        lastAssistant: { role: "assistant", finishedAt: 1 },
      }),
    ).toBe(false);
  });

  /** finishedAt is a timestamp, so zero still means finished. */
  test("treats finishedAt: 0 as finished", () => {
    expect(
      isUnclaimedOpenTurn({
        hasPendingTurn: false,
        lastAssistant: { role: "assistant", finishedAt: 0 },
      }),
    ).toBe(false);
  });

  /** Synthetic turns are the daemon's own continuations, not a user's turn. */
  test("does not re-stage a synthetic turn", () => {
    expect(
      isUnclaimedOpenTurn({
        hasPendingTurn: false,
        lastAssistant: { role: "assistant", isSyntheticTurn: true },
      }),
    ).toBe(false);
  });

  /** The newest row being a user message means the turn was never opened. */
  test("does not re-stage when the newest message is not an assistant row", () => {
    expect(
      isUnclaimedOpenTurn({
        hasPendingTurn: false,
        lastAssistant: { role: "user" },
      }),
    ).toBe(false);
  });

  test("does not re-stage an empty history", () => {
    expect(
      isUnclaimedOpenTurn({ hasPendingTurn: false, lastAssistant: null }),
    ).toBe(false);
  });
});

/**
 * Manager Ave (session 111) carried a `pendingTurn` staged on 27 Aug whose turn
 * had long closed. `ensurePendingTurn` read the full slot as "already staged"
 * and refused every later turn a prompt, so each one opened, was never claimed
 * (`leaseGeneration` 0) and stalled out ~15 minutes later — for weeks.
 */
describe("isPendingTurnLive", () => {
  const openTurnId = "turn_open";

  test("an empty slot is not live", () => {
    expect(
      isPendingTurnLive({ pendingTurn: undefined, openTurnId }),
    ).toBe(false);
  });

  test("the slot staged by the open turn is live", () => {
    expect(
      isPendingTurnLive({ pendingTurn: { turnId: openTurnId }, openTurnId }),
    ).toBe(true);
  });

  test("a slot left by a turn that already closed is not live", () => {
    expect(
      isPendingTurnLive({ pendingTurn: { turnId: "turn_dead" }, openTurnId }),
    ).toBe(false);
  });

  /** Ave's orphan predated durable turns, so it carried no turnId at all. */
  test("a slot with no turnId is not live once a durable turn is open", () => {
    expect(isPendingTurnLive({ pendingTurn: {}, openTurnId })).toBe(false);
  });

  /** Legacy sessions have no durable turn, so the slot is the only record. */
  test("any slot is live when no durable turn is open", () => {
    expect(
      isPendingTurnLive({ pendingTurn: {}, openTurnId: undefined }),
    ).toBe(true);
  });
});

/**
 * Orphans only exist because the stall teardown left the slot full. Clearing it
 * there is what stops a single stalled turn wedging the session permanently.
 */
describe("the stall teardown frees the handoff slot", () => {
  const adapters = readSource("_chat/surfaceAdapters.ts");

  test("session release clears pendingTurn on the session and the mirror", () => {
    const release = adapters.slice(
      adapters.indexOf('kind: "session"'),
      adapters.indexOf('kind: "taskChat"'),
    );
    expect(release).toContain("pendingTurn: undefined");
    expect(release).toContain("syncSessionDaemonState(ctx, session, {");
  });
});

/**
 * The re-stage only helps if it runs while the workflow is still waiting.
 * Scheduled after `awaitEvent`, it would fire once the turn had already
 * completed — which is the state it exists to prevent.
 */
describe("the workflow re-stages before it waits", () => {
  const workflow = readSource("_sessions/workflow.ts");

  test("ensurePendingTurn runs before awaitEvent", () => {
    const restageAt = workflow.indexOf(
      "internal.sessionWorkflow.ensurePendingTurn",
    );
    const awaitAt = workflow.indexOf("step.awaitEvent(sessionCompleteEvent)");
    expect(restageAt, "the re-stage moved or was renamed").toBeGreaterThan(-1);
    expect(awaitAt, "the completion wait moved").toBeGreaterThan(-1);
    expect(restageAt).toBeLessThan(awaitAt);
  });

  /**
   * The ops path rebuilds the prompt from the user message, so a bubble that
   * already streamed text would replay work the user has seen.
   */
  test("the ops re-stage still refuses a bubble with content", () => {
    const body = definitionBody(workflow, "restageOpenTurn");
    expect(body).toContain("isUnclaimedOpenTurn(");
    expect(body).toContain('lastAssistant.content !== ""');
  });
});

/** Comments name the very calls these rules rule out, so they have to go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

/** One Convex definition, ending on the `\n});` that closes it. */
function definitionBody(source: string, name: string): string {
  const startAt = source.indexOf(`export const ${name} =`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n});", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
