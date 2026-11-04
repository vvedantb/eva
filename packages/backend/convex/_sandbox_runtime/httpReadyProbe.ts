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

/**
 * Echoes `onListening` if anything is LISTEN on `port`, else `onFree`.
 * ss → lsof → /proc/net/tcp{,6} scan (Vercel images often lack ss and lsof).
 * The /proc scan matches state 0A (LISTEN) only, so a TIME_WAIT left by a
 * just-killed server does not read as listening.
 */
export function buildPortListenProbeCommand(
  port: number,
  onListening = "yes",
  onFree = "no",
): string {
  // /proc/net/tcp local_address port is hex, big-endian (13000 → 32C8).
  const hex = port.toString(16).toUpperCase().padStart(4, "0");
  return [
    `if command -v ss >/dev/null 2>&1; then ss -ltn 2>/dev/null | grep -q ":${port} " && echo ${onListening} && exit 0; fi`,
    `if command -v lsof >/dev/null 2>&1; then lsof -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1 && echo ${onListening} && exit 0; fi`,
    `if grep -Eiq ":${hex} [0-9A-F]+:[0-9A-F]+ 0A " /proc/net/tcp /proc/net/tcp6 2>/dev/null; then echo ${onListening}; exit 0; fi`,
    `echo ${onFree}`,
  ].join("; ");
}

/** Newline-joined script lines that free `port` via fuser, else lsof + kill. */
export function buildFreePortLines(port: number): string[] {
  return [
    `if command -v fuser >/dev/null 2>&1; then fuser -k ${port}/tcp >/dev/null 2>&1 || true`,
    `elif command -v lsof >/dev/null 2>&1; then for p in $(lsof -ti :${port} 2>/dev/null || true); do kill "$p" 2>/dev/null || true; done`,
    "fi",
  ];
}
