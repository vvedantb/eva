import type { ActivityStep } from "@eva/ui";

/**
 * One streaming tick fans the same `currentActivity` string out to every
 * activity consumer at once — the timeline, the composer todo badge, the
 * sub-agent CTA row, the question cards, the silence clock — and each one used
 * to `JSON.parse` it independently. The payload is capped at 600 KB, so a
 * tool-heavy turn paid seven full parses of a few hundred KB per token, which
 * is where the mid-stream freezes came from.
 *
 * Convex hands every consumer the *same string reference*, so an identity-first
 * cache collapses those seven parses into one. Entries are MRU-ordered and the
 * list is short: the live payload plus whichever settled `activityLog`s are
 * re-rendering.
 *
 * Callers must treat the result as read-only — they share one array.
 */
const CACHE_SIZE = 4;

interface ParsedActivity {
  source: string;
  steps: ActivityStep[] | null;
  /** Well-formed payload carrying zero steps (writer alive, nothing to say). */
  isEmpty: boolean;
}

const cache: ParsedActivity[] = [];

function parseUncached(data: string): ParsedActivity {
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return { source: data, steps: null, isEmpty: true };
      if (parsed[0].type) return { source: data, steps: parsed, isEmpty: false };
    }
  } catch {
    // Legacy plain text format
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
  return readActivity(data).isEmpty;
}
