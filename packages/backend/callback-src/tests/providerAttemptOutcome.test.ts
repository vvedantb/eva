import { beforeEach, describe, expect, test } from "vitest";
import {
  providerAttemptTimedOut,
  providerAttemptWasInterrupted,
  resolveProviderAttemptOutcome,
} from "../runtime/completion.js";
import { callbackState as S, resetStateForTests } from "../runtime/state.js";
import type { ProviderAttemptResult, ResultEvent } from "../types.js";

/**
 * `resolveProviderAttemptOutcome` is the single decision that turns a finished
 * agent process into "this turn succeeded" or "this turn failed with X", shared
 * by all four SDK runners. The existing guards read the source text, so an
 * inverted branch that keeps the same identifiers still passes them — these
 * exercise the rules instead.
 */

const cleanAttempt: ProviderAttemptResult = {
  code: 0,
  terminatedBySignal: false,
  output: "",
  timedOutForNoOutput: false,
  timedOutForMaxRuntime: false,
  timedOutForFirstEvent: false,
  timedOutForFirstAssistant: false,
  timedOutAfterFirstText: false,
  timedOutForZombie: false,
  toolStallErrorMessage: "",
};

function attempt(
  overrides: Partial<ProviderAttemptResult> = {},
): ProviderAttemptResult {
  return { ...cleanAttempt, ...overrides };
}

function resultEvent(overrides: Partial<ResultEvent> = {}): ResultEvent {
  return {
    result: "Done.",
    isError: false,
    rawResultEvent: "{}",
    ...overrides,
  };
}

beforeEach(() => {
  resetStateForTests();
  S.rawOutput = "";
  S.stderrOutput = "";
});

describe("providerAttemptWasInterrupted", () => {
  test.each([
    ["a direct signal", { terminatedBySignal: true }],
    ["a shell-translated SIGKILL", { code: 137 }],
    ["a shell-translated SIGTERM", { code: 143 }],
  ])("treats %s as an interruption", (_label, overrides) => {
    expect(providerAttemptWasInterrupted(attempt(overrides))).toBe(true);
  });

  test("leaves ordinary exits alone", () => {
    expect(providerAttemptWasInterrupted(attempt())).toBe(false);
    expect(providerAttemptWasInterrupted(attempt({ code: 1 }))).toBe(false);
  });
});

describe("providerAttemptTimedOut", () => {
  test.each([
    ["no stdout", { timedOutForNoOutput: true }],
    ["max runtime", { timedOutForMaxRuntime: true }],
    ["first event", { timedOutForFirstEvent: true }],
    ["first assistant message", { timedOutForFirstAssistant: true }],
    ["a stall after the first text", { timedOutAfterFirstText: true }],
    ["a zombie agent process", { timedOutForZombie: true }],
    ["a stalled tool", { toolStallErrorMessage: "read stalled" }],
  ])("counts the %s watchdog", (_label, overrides) => {
    expect(providerAttemptTimedOut(attempt(overrides))).toBe(true);
  });

  test("a clean attempt did not time out", () => {
    expect(providerAttemptTimedOut(attempt())).toBe(false);
  });
});

describe("resolveProviderAttemptOutcome", () => {
  test("a clean run with a result event succeeds", () => {
    expect(resolveProviderAttemptOutcome(attempt(), resultEvent())).toEqual({
      success: true,
      error: null,
    });
  });

  /**
   * Cursor's fallback result is built from the last streamed assistant text, so
   * a killed run still arrives carrying a plausible-looking answer. Reporting
   * that as success would mark an interrupted turn complete.
   */
  test.each([
    ["a direct signal", { terminatedBySignal: true, code: 0 }],
    ["a shell-translated SIGKILL", { code: 137 }],
    ["a shell-translated SIGTERM", { code: 143 }],
  ])("%s defeats a result event that claims success", (_label, overrides) => {
    expect(
      resolveProviderAttemptOutcome(attempt(overrides), resultEvent()).success,
    ).toBe(false);
  });

  test("a shell-translated kill reports why the turn ended", () => {
    expect(
      resolveProviderAttemptOutcome(attempt({ code: 143 }), resultEvent())
        .error,
    ).toContain("run was interrupted");
  });

  test("a signal-killed run with no result event still fails", () => {
    const outcome = resolveProviderAttemptOutcome(
      attempt({ terminatedBySignal: true, code: 137 }),
      null,
    );
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain("ran out of memory");
  });

  /** The provider diagnosed itself; its wording reaches the user unchanged. */
  test("a provider error event is reported verbatim", () => {
    const outcome = resolveProviderAttemptOutcome(
      attempt({ code: 1 }),
      resultEvent({ isError: true, result: "Credit balance is too low" }),
    );
    expect(outcome).toEqual({
      success: false,
      error: "Credit balance is too low",
    });
  });

  /**
   * The agent answered, then its process exited badly on the way out (a flush
   * or teardown failure). The answer is already persisted, so the turn is not
   * failed for the exit code alone.
   */
  test("a non-zero exit after a good result event is still a success", () => {
    expect(
      resolveProviderAttemptOutcome(attempt({ code: 1 }), resultEvent()),
    ).toEqual({ success: true, error: null });
  });

  /** Same reasoning for a watchdog that fired after the result was in. */
  test("a watchdog that fired after a good result event does not fail the turn", () => {
    expect(
      resolveProviderAttemptOutcome(
        attempt({ timedOutForNoOutput: true }),
        resultEvent(),
      ),
    ).toEqual({ success: true, error: null });
  });

  test("a watchdog with no result event fails, naming the phase", () => {
    const outcome = resolveProviderAttemptOutcome(
      attempt({ timedOutForMaxRuntime: true }),
      null,
    );
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain("max runtime");
  });

  test("a stalled tool fails with the stall message", () => {
    const outcome = resolveProviderAttemptOutcome(
      attempt({ toolStallErrorMessage: "Bash has produced no output for 10m" }),
      null,
    );
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain("Bash has produced no output for 10m");
  });

  test("a fatal heartbeat error outranks the exit code", () => {
    S.fatalHeartbeatErrorMessage = "Turn lease lost";
    const outcome = resolveProviderAttemptOutcome(attempt({ code: 23 }), null);
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain("Turn lease lost");
    expect(outcome.error).not.toContain("exited with code 23");
  });

  /** Failures carry the captured output so a blank agent crash is diagnosable. */
  test("a failure appends the captured output tails", () => {
    S.rawOutput = "loading model";
    S.stderrOutput = "invalid model name";
    const outcome = resolveProviderAttemptOutcome(attempt({ code: 1 }), null);
    expect(outcome.error).toContain("stdout tail:");
    expect(outcome.error).toContain("loading model");
    expect(outcome.error).toContain("stderr tail:");
    expect(outcome.error).toContain("invalid model name");
  });

  /**
   * A clean exit that never emitted a result event produced no answer, so the
   * turn is not a success — but there is nothing to diagnose either, and the
   * callers turn this into their own "no result" completion.
   */
  test("a clean exit with no result event is neither success nor error", () => {
    expect(resolveProviderAttemptOutcome(attempt(), null)).toEqual({
      success: false,
      error: null,
    });
  });
});
