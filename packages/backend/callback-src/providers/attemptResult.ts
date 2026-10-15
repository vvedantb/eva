import { updateThinkingStep } from "../parse/canonical.js";
import { callbackState as S, resetAttemptState } from "../runtime/state.js";
import type { ProviderAttemptResult, SessionMode } from "../types.js";
import { log } from "../utils.js";

/**
 * Shared start of a one-shot SDK attempt. `startupStep` is a thunk because
 * some startup copy reads attempt state that resetAttemptState() clears.
 */
export function beginSdkAttempt(
  name: string,
  sessionMode: SessionMode,
  startupStep: () => { label: string; detail: string },
): void {
  resetAttemptState();
  S.activeAttemptStartedAt = Date.now();
  const step = startupStep();
  updateThinkingStep(step.label, step.detail);
  log(
    name +
      " started (mode=" +
      sessionMode.mode +
      ", sessionId=" +
      (sessionMode.sessionId || "none") +
      ")",
  );
}

/**
 * Shared end of a one-shot SDK attempt: computes the exit code and logs the
 * summary. Runners pass the result to buildStandardSdkAttemptResult().
 */
export function finishSdkAttempt(p: {
  name: string;
  sawResult: boolean;
  resultIsError: boolean;
  timedOutForNoOutput: boolean;
  timedOutForMaxRuntime: boolean;
  output: string;
  errorLabel: string;
  errorMessage: string;
}): {
  code: number;
  output: string;
  timedOutForNoOutput: boolean;
  timedOutForMaxRuntime: boolean;
} {
  const code =
    p.sawResult &&
    !p.resultIsError &&
    !p.timedOutForMaxRuntime &&
    !p.timedOutForNoOutput
      ? 0
      : 1;
  log(
    p.name +
      " finished in " +
      String(Date.now() - S.activeAttemptStartedAt) +
      "ms (code=" +
      code +
      ", sawResult=" +
      p.sawResult +
      ", resultIsError=" +
      p.resultIsError +
      ", timedOutForNoOutput=" +
      p.timedOutForNoOutput +
      ", timedOutForMaxRuntime=" +
      p.timedOutForMaxRuntime +
      ", outputBytes=" +
      p.output.length +
      (p.errorMessage ? ", " + p.errorLabel + "=" + p.errorMessage : "") +
      ")",
  );
  return {
    code,
    output: p.output,
    timedOutForNoOutput: p.timedOutForNoOutput,
    timedOutForMaxRuntime: p.timedOutForMaxRuntime,
  };
}

/**
 * SDK runners that do not report first-event / zombie / tool-stall flags
 * still have to fill the shared ProviderAttemptResult shape.
 */
export function buildStandardSdkAttemptResult(params: {
  code: number;
  output: string;
  timedOutForNoOutput: boolean;
  timedOutForMaxRuntime: boolean;
}): ProviderAttemptResult {
  return {
    code: params.code,
    terminatedBySignal: false,
    output: params.output,
    timedOutForNoOutput: params.timedOutForNoOutput,
    timedOutForMaxRuntime: params.timedOutForMaxRuntime,
    timedOutForFirstEvent: false,
    timedOutForFirstAssistant: false,
    timedOutAfterFirstText: false,
    timedOutForZombie: false,
    toolStallErrorMessage: "",
  };
}
