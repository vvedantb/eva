import { beforeEach, describe, expect, test } from "vitest";
import {
  beginSdkAttempt,
  finishSdkAttempt,
} from "../providers/attemptResult.js";
import { callbackState as S, resetStateForTests } from "../runtime/state.js";

const cleanFinish = {
  name: "testAttempt",
  sawResult: true,
  resultIsError: false,
  timedOutForNoOutput: false,
  timedOutForMaxRuntime: false,
  output: "out",
  errorLabel: "error",
  errorMessage: "",
};

beforeEach(() => {
  resetStateForTests();
});

describe("finishSdkAttempt", () => {
  test("code is 0 only for a clean result", () => {
    expect(finishSdkAttempt(cleanFinish)).toEqual({
      code: 0,
      output: "out",
      timedOutForNoOutput: false,
      timedOutForMaxRuntime: false,
    });
  });

  test.each([
    { sawResult: false },
    { resultIsError: true },
    { timedOutForNoOutput: true },
    { timedOutForMaxRuntime: true },
  ])("code is 1 when %o", (flag) => {
    expect(finishSdkAttempt({ ...cleanFinish, ...flag }).code).toBe(1);
  });
});

describe("beginSdkAttempt", () => {
  test("runs the startup step after the attempt state reset", () => {
    S.claudeInitAt = 123;
    S.activeAttemptStartedAt = 0;
    let seenInitAt = -1;
    beginSdkAttempt("testAttempt", { mode: "none", sessionId: null }, () => {
      seenInitAt = S.claudeInitAt;
      return { label: "Starting...", detail: "detail" };
    });
    expect(seenInitAt).toBe(0);
    expect(S.activeAttemptStartedAt).toBeGreaterThan(0);
    expect(S.transientThinkingStep).toMatchObject({
      label: "Starting...",
      detail: "detail",
    });
  });
});
