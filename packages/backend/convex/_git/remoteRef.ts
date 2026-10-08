/**
 * Git exit 128 "couldn't find remote ref" is expected when the requested
 * branch was deleted (e.g. a finished `eva/automation-*` run) or never pushed.
 * Callers must treat this as a handled outcome, not an uncaught command failure.
 */
export function isMissingRemoteRefError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("couldn't find remote ref") ||
    lower.includes("could not find remote ref")
  );
}

/** True when a sandbox git fetch failed because that ref is gone on the remote. */
export function isMissingRemoteRefFetchFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return isMissingRemoteRefError(message);
}
