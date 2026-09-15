import { quote } from "shell-quote";

/**
 * Shell loop that curls a URL until it answers or the attempt budget ends.
 * Callers choose success/timeout tokens so code-server vs Chrome can differ.
 */
export function buildHttpReadyProbeCommand(params: {
  url: string;
  attempts: number;
  sleepSec: number;
  onReady: string;
  onTimeout: string;
}): string {
  return (
    `for i in $(seq 1 ${params.attempts}); do ` +
    `curl -fsS ${quote([params.url])} >/dev/null 2>&1 && ${params.onReady}; ` +
    `sleep ${params.sleepSec}; ` +
    `done; ${params.onTimeout}`
  );
}
