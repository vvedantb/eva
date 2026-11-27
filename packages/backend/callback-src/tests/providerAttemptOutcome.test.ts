import { beforeEach, describe, expect, test } from "bun:test";
import {
  providerAttemptTimedOut,
  providerAttemptWasInterrupted,
  resolveProviderAttemptOutcome,
} from "../runtime/completion.js";
import { callbackState as S, resetStateForTests } from "../runtime/state.js";
import type { ProviderAttemptResult, ResultEvent } from "../types.js";

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

const everyWatchdog = {
  timedOutForNoOutput: true,
  timedOutForMaxRuntime: true,
  timedOutForFirstEvent: true,
  timedOutForFirstAssistant: true,
  timedOutAfterFirstText: true,
  timedOutForZombie: true,
} satisfies Partial<ProviderAttemptResult>;

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
    expect(outcome.error).toContain("nothing was completed");
  });

  test.each([
    ["an exit", { code: 1 }],
    ["a timeout", { code: 1, timedOutForMaxRuntime: true }],
  ])(
    "a provider error event after %s is reported verbatim",
    (_label, overrides) => {
      const outcome = resolveProviderAttemptOutcome(
        attempt(overrides),
        resultEvent({ isError: true, result: "Credit balance is too low" }),
      );
      expect(outcome).toEqual({
        success: false,
        error: "Credit balance is too low",
      });
    },
  );

  test("a non-zero exit after a good result event is still a success", () => {
    expect(
      resolveProviderAttemptOutcome(attempt({ code: 1 }), resultEvent()),
    ).toEqual({ success: true, error: null });
  });

  test("a watchdog that fired after a good result event does not fail the turn", () => {
    expect(
      resolveProviderAttemptOutcome(
        attempt({ timedOutForNoOutput: true }),
        resultEvent(),
      ),
    ).toEqual({ success: true, error: null });
  });

  test.each([
    [{ timedOutForMaxRuntime: true }, "max runtime"],
    [{ timedOutForNoOutput: true }, "no stdout"],
    [{ timedOutForFirstEvent: true }, "no parseable"],
    [{ timedOutForFirstAssistant: true }, "no assistant response"],
    [{ timedOutAfterFirstText: true }, "stalled after first text"],
    [{ timedOutForZombie: true }, "zombie state"],
  ])(
    "a watchdog with no result event fails, naming the phase (%o)",
    (overrides, phase) => {
      const outcome = resolveProviderAttemptOutcome(attempt(overrides), null);
      expect(outcome.success).toBe(false);
      expect(outcome.error).toContain(phase);
    },
  );

  test("a stalled tool fails with the stall message, not a timeout phase", () => {
    const outcome = resolveProviderAttemptOutcome(
      attempt({
        toolStallErrorMessage: "Bash has produced no output for 10m",
        ...everyWatchdog,
      }),
      null,
    );
    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/^Bash has produced no output for 10m\n\n/);
  });

  test("an ordinary non-zero exit names its exit code", () => {
    expect(
      resolveProviderAttemptOutcome(attempt({ code: 23 }), null).error,
    ).toMatch(/^Claude CLI exited with code 23\n\n/);
  });

  test("a fatal heartbeat error outranks every local diagnosis", () => {
    S.fatalHeartbeatErrorMessage = "Turn lease lost";
    const outcome = resolveProviderAttemptOutcome(
      attempt({
        code: 137,
        toolStallErrorMessage: "Bash has produced no output for 10m",
        ...everyWatchdog,
      }),
      null,
    );
    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/^Turn lease lost\n\n/);
  });

  test("a failure appends the captured output tails", () => {
    S.rawOutput = "loading model";
    S.stderrOutput = "invalid model name";
    const outcome = resolveProviderAttemptOutcome(attempt({ code: 1 }), null);
    expect(outcome.error).toContain("stdout tail:");
    expect(outcome.error).toContain("loading model");
    expect(outcome.error).toContain("stderr tail:");
    expect(outcome.error).toContain("invalid model name");
  });

  test("a clean exit with no result event is neither success nor error", () => {
    expect(resolveProviderAttemptOutcome(attempt(), null)).toEqual({
      success: false,
      error: null,
    });
  });
});
