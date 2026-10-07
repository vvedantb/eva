import type { ProviderAttemptResult } from "../types.js";

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
