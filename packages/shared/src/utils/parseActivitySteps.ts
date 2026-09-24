import type { ActivityStep } from "@eva/ui";

export function parseActivitySteps(
  data: string | undefined,
): ActivityStep[] | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
      return parsed;
    }
  } catch {
    // Legacy plain text format
  }
  return null;
}

/**
 * The labels the sandbox startup pipeline emits (see `SANDBOX_STARTUP_LABELS`
 * in the backend's staleness policy). They are plumbing — cloning, installing,
 * checking out — and mean nothing to a reader who only wants to know Eva is
 * waking up, so simple view collapses the whole run into one line.
 */
const SANDBOX_STARTUP_LABELS = new Set([
  "Starting sandbox...",
  "Creating sandbox...",
  "Resuming sandbox...",
  "Syncing repository...",
  "Cloning repository...",
  "Installing dependencies...",
  "Fetching base branch...",
  "Checking out base branch...",
  "Setting up branch...",
  "Starting desktop...",
  "Retrying sandbox setup...",
]);

/** Whether every step in `data` is a sandbox startup step. */
export function isSandboxStartupActivity(data: string | undefined): boolean {
  const steps = parseActivitySteps(data);
  if (!steps) return false;
  return steps.every((step) => SANDBOX_STARTUP_LABELS.has(step.label));
}

/**
 * Whether `data` is a well-formed activity payload carrying zero steps — the
 * writer is alive and publishing, it just has nothing to report.
 *
 * `parseActivitySteps` collapses "no payload yet" and "empty payload" into the
 * same `null`, so callers that render a placeholder cannot tell ordinary
 * startup lag from a provider stream that has gone silent for minutes.
 */
export function isEmptyActivityPayload(data: string | undefined): boolean {
  if (!data) return false;
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) && parsed.length === 0;
  } catch {
    return false;
  }
}
