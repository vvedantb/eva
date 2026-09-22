const WORKSPACE_DIR = "/tmp/repo";

/** POSIX-safe single quotes for a sandbox `cd` path. */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Bounded `tsc --noEmit` for implementation prompts. Tail-only output keeps
 * the agent context small; the 120s timeout is below the sandbox action cap.
 */
export function buildTypecheckCommand(rootDirectory: string): string {
  const typecheckDirectory = rootDirectory
    ? `${WORKSPACE_DIR}/${rootDirectory}`
    : WORKSPACE_DIR;
  return `cd ${shellSingleQuote(typecheckDirectory)} && { status=0; timeout --kill-after=10s 120s npx tsc --noEmit --pretty false > /tmp/eva-tsc.log 2>&1 || status=$?; tail -50 /tmp/eva-tsc.log; exit "$status"; }`;
}
