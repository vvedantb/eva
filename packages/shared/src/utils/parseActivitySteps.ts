import type { ActivityStep } from "@vvedantb/ui";

const CACHE_SIZE = 4;

interface ParsedActivity {
  source: string;
  steps: ActivityStep[] | null;
  isEmpty: boolean;
}

const cache: ParsedActivity[] = [];

function parseUncached(data: string): ParsedActivity {
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      if (parsed.length === 0)
        return { source: data, steps: null, isEmpty: true };
      if (parsed[0].type)
        return { source: data, steps: parsed, isEmpty: false };
    }
  } catch {
  }
  return { source: data, steps: null, isEmpty: false };
}

function readActivity(data: string): ParsedActivity {
  for (let i = 0; i < cache.length; i++) {
    const entry = cache[i];
    if (entry === undefined || entry.source !== data) continue;
    if (i > 0) {
      cache.splice(i, 1);
      cache.unshift(entry);
    }
    return entry;
  }
  const entry = parseUncached(data);
  cache.unshift(entry);
  if (cache.length > CACHE_SIZE) cache.length = CACHE_SIZE;
  return entry;
}

export function parseActivitySteps(
  data: string | undefined,
): ActivityStep[] | null {
  if (!data) return null;
  return readActivity(data).steps;
}

const SANDBOX_STARTUP_LABELS = new Set([
  "Starting sandbox...",
  "Creating sandbox...",
  "Resuming sandbox...",
  "Syncing repository...",
  "Cloning repository...",
  "Installing dependencies...",
  "Fetching base branch...",
  "Fetching task branch...",
  "Checking out base branch...",
  "Setting up branch...",
  "Restoring seeded runtime...",
  "Launching background commands...",
  "Running startup commands...",
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
  return readActivity(data).isEmpty;
}
