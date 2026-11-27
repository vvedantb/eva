import { PROVIDER_ACCOUNT_ID, REPO_ID } from "../config.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import type {
  JsonObject,
  JsonValue,
  UsageLimitSnapshot,
  UsageLimitStatus,
  UsageLimitWindow,
} from "../types.js";
import { isJsonObject, log, trimmedString } from "../utils.js";
import { callbackState as S } from "./state.js";

const REPORT_MUTATION = "usageLimits:report";
const NOTE_REFRESH_MUTATION = "usageLimits:noteRefreshAttempt";

const REPORT_MAX_RETRIES = 1;
const USAGE_LOOKUP_TIMEOUT_MS = 5_000;
const FORCE_USAGE_LOOKUP_TIMEOUT_MS = 20_000;
const USAGE_REPORT_EXIT_GRACE_MS = 7_000;
const USAGE_REPORT_REFRESH_MS = 6 * 60 * 60 * 1000;

let pendingClaudeUsageReport: Promise<void> | null = null;

/**
 * Provider whose plan usage is tracked. Mirrors the Convex validator, and stays
 * a named type so a provider with real plan windows slots in here.
 */
export type UsageLimitProvider = "claude";

const CLAUDE_WINDOW_LABELS: Record<string, string> = {
  five_hour: "5h",
  seven_day: "Weekly (all models)",
  seven_day_oauth_apps: "Weekly (apps)",
  seven_day_opus: "Weekly (Opus)",
  seven_day_sonnet: "Weekly (Sonnet)",
  seven_day_overage_included: "Weekly (overage included)",
  overage: "Extra usage",
};

type ClaudeUsageWindowLike = {
  utilization?: number | null;
  resets_at?: string | null;
} | null;

export type ClaudeUsageResponseLike = {
  subscription_type?: string | null;
  rate_limits_available?: boolean;
  rate_limits?: {
    five_hour?: ClaudeUsageWindowLike;
    seven_day?: ClaudeUsageWindowLike;
    seven_day_oauth_apps?: ClaudeUsageWindowLike;
    seven_day_opus?: ClaudeUsageWindowLike;
    seven_day_sonnet?: ClaudeUsageWindowLike;
    seven_day_overage_included?: ClaudeUsageWindowLike;
    overage?: ClaudeUsageWindowLike;
    model_scoped?: {
      display_name?: string;
      utilization?: number | null;
      resets_at?: string | null;
    }[];
  } | null;
  value?: ClaudeUsageResponseLike | null;
};

type ClaudeUsageReportInput = {
  readUsage: () => Promise<ClaudeUsageResponseLike | null>;
  error?: string;
  force?: boolean;
};

function readFiniteNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readStatus(
  value: JsonValue | undefined,
): UsageLimitStatus | undefined {
  return value === "allowed" ||
    value === "allowed_warning" ||
    value === "rejected"
    ? value
    : undefined;
}

/** ISO 8601 timestamp to epoch ms, or undefined when unparseable. */
export function readIsoMs(value: JsonValue | undefined): number | undefined {
  const text = trimmedString(value);
  if (!text) return undefined;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : undefined;
}

function buildWindow(
  key: string,
  label: string,
  utilization: number | undefined,
  resetsAt: number | undefined,
): UsageLimitWindow {
  return {
    key,
    label,
    ...(utilization === undefined ? {} : { utilization }),
    ...(resetsAt === undefined ? {} : { resetsAt }),
  };
}

function mergeWindow(
  snapshot: UsageLimitSnapshot,
  window: UsageLimitWindow,
): void {
  const windows = snapshot.windows ?? [];
  const index = windows.findIndex((existing) => existing.key === window.key);
  if (index >= 0) {
    windows[index] = window;
  } else {
    windows.push(window);
  }
  snapshot.windows = windows;
}

function ensureSnapshot(): UsageLimitSnapshot {
  const existing = S.usageLimitSnapshot;
  if (existing) return existing;
  const created: UsageLimitSnapshot = { completeness: "partial" };
  S.usageLimitSnapshot = created;
  return created;
}

function normalizeWindowKey(key: string): string {
  if (key === "seven_day_oi") return "model_scoped:Fable";
  return key;
}

function labelForWindowKey(key: string): string {
  if (CLAUDE_WINDOW_LABELS[key]) return CLAUDE_WINDOW_LABELS[key];
  if (key.startsWith("model_scoped:")) {
    return `Weekly (${key.slice("model_scoped:".length)})`;
  }
  return key;
}

/**
 * Folds one Claude `rate_limit_event` stream message into the snapshot. The
 * event carries the plan-wide status plus exactly ONE window's utilization, so
 * it is merged per window key and never treated as the whole picture.
 */
export function mergeClaudeRateLimitEvent(event: JsonObject): void {
  const info = event.rate_limit_info;
  if (!isJsonObject(info)) return;
  const status = readStatus(info.status);
  const rawKey = trimmedString(info.rateLimitType);
  if (!status && !rawKey) return;
  const snapshot = ensureSnapshot();
  snapshot.completeness = "partial";
  if (status) snapshot.status = status;
  if (!rawKey) return;
  const key = normalizeWindowKey(rawKey);
  const resetsAtSeconds = readFiniteNumber(info.resetsAt);
  mergeWindow(
    snapshot,
    buildWindow(
      key,
      labelForWindowKey(key),
      readFiniteNumber(info.utilization),
      resetsAtSeconds === undefined
        ? undefined
        : Math.round(resetsAtSeconds * 1000),
    ),
  );
}

function pushUsageWindow(
  windows: UsageLimitWindow[],
  key: string,
  entry: ClaudeUsageWindowLike | undefined,
  label?: string,
): void {
  if (!entry) return;
  const utilization = readFiniteNumber(entry.utilization);
  const resetsAt = readIsoMs(entry.resets_at);
  if (utilization === undefined && resetsAt === undefined) return;
  windows.push(
    buildWindow(
      key,
      label ?? CLAUDE_WINDOW_LABELS[key] ?? key,
      utilization,
      resetsAt,
    ),
  );
}

/** Every populated window in a `/usage` response, in display order. */
export function readClaudeUsageWindows(
  response: ClaudeUsageResponseLike | null | undefined,
): UsageLimitWindow[] {
  const limits = response?.rate_limits;
  if (!limits) return [];
  const windows: UsageLimitWindow[] = [];
  pushUsageWindow(windows, "five_hour", limits.five_hour);
  pushUsageWindow(windows, "seven_day", limits.seven_day);
  pushUsageWindow(windows, "seven_day_opus", limits.seven_day_opus);
  pushUsageWindow(windows, "seven_day_sonnet", limits.seven_day_sonnet);
  pushUsageWindow(windows, "seven_day_oauth_apps", limits.seven_day_oauth_apps);
  pushUsageWindow(
    windows,
    "seven_day_overage_included",
    limits.seven_day_overage_included,
  );
  for (const entry of limits.model_scoped ?? []) {
    const name = trimmedString(entry.display_name);
    if (!name) continue;
    pushUsageWindow(windows, "model_scoped:" + name, entry, `Weekly (${name})`);
  }
  pushUsageWindow(windows, "overage", limits.overage);
  return windows;
}

/** Control-channel payloads sometimes nest the reading under `value`. */
export function unwrapUsagePayload(
  response: ClaudeUsageResponseLike,
): ClaudeUsageResponseLike {
  const nested = response.value;
  if (
    nested !== null &&
    nested !== undefined &&
    (nested.rate_limits_available !== undefined ||
      nested.rate_limits !== undefined ||
      nested.subscription_type !== undefined)
  ) {
    return nested;
  }
  return response;
}

function usageAvailability(payload: ClaudeUsageResponseLike): boolean | null {
  if (payload.rate_limits_available === true) return true;
  if (payload.rate_limits_available === false) return false;
  if (payload.rate_limits !== undefined && payload.rate_limits !== null) {
    return true;
  }
  return null;
}

function noteDaemonRefresh(
  captured: boolean,
  available: boolean | null,
  detail: string,
): void {
  void callConvexWithRetry(
    "mutation",
    NOTE_REFRESH_MUTATION,
    {
      captured,
      detail,
      ...(available === null ? {} : { available }),
    },
    REPORT_MAX_RETRIES,
  ).catch(() => {
  });
}

/**
 * Reads the Agent SDK's EXPERIMENTAL plan-usage endpoint and merges what it
 * reports into the snapshot. The SDK states outright that this API may change or
 * vanish without notice, so every failure — a missing method, a transport error,
 * an unexpected shape — is swallowed with a log line. A usage reading is never
 * worth failing a turn for.
 */
export async function captureClaudeUsage(
  readUsage: () => Promise<ClaudeUsageResponseLike | null>,
  recordAttempt = false,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lookupTimeoutMs = recordAttempt
    ? FORCE_USAGE_LOOKUP_TIMEOUT_MS
    : USAGE_LOOKUP_TIMEOUT_MS;
  try {
    const response = await Promise.race([
      readUsage(),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), lookupTimeoutMs);
      }),
    ]);
    if (response === "timeout") {
      log("usage limits: claude usage lookup timed out");
      if (recordAttempt) noteDaemonRefresh(false, null, "timeout");
      return false;
    }
    if (!response) {
      if (recordAttempt) noteDaemonRefresh(false, null, "null-response");
      return false;
    }
    const payload = unwrapUsagePayload(response);
    const available = usageAvailability(payload);
    if (available === null) {
      log("usage limits: claude usage response omitted availability");
      if (recordAttempt) noteDaemonRefresh(false, null, "omitted-availability");
      return false;
    }
    if (available === false) {
      log(
        "usage limits: claude plan usage unavailable — preserving prior reading",
      );
      if (!S.usageLimitSnapshot) {
        S.usageLimitSnapshot = { completeness: "refused" };
      }
      if (recordAttempt) {
        noteDaemonRefresh(false, false, "rate-limits-unavailable");
      }
      return false;
    }
    const snapshot: UsageLimitSnapshot = { completeness: "complete" };
    const subscriptionType = trimmedString(payload.subscription_type);
    if (subscriptionType) snapshot.subscriptionType = subscriptionType;
    snapshot.windows = readClaudeUsageWindows(payload);
    S.usageLimitSnapshot = snapshot;
    if (recordAttempt) {
      noteDaemonRefresh(true, true, subscriptionType ?? "complete");
    }
    return true;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    log("usage limits: claude usage lookup failed — " + messageText);
    if (recordAttempt) {
      noteDaemonRefresh(false, null, "error:" + messageText.slice(0, 120));
    }
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Folds provider refusal copy into the plan snapshot shown by the UI. */
export function captureClaudeUsageLimitError(error: string | undefined): void {
  if (!error) return;
  const message = error.toLowerCase();
  if (
    !message.includes("out of extra usage") &&
    !message.includes("rate limit") &&
    !message.includes("usage limit") &&
    !message.includes("session limit") &&
    !message.includes("spend limit") &&
    !message.includes("token limit exceeded")
  ) {
    return;
  }
  const snapshot = ensureSnapshot();
  snapshot.status = "rejected";
}

function windowToJson(window: UsageLimitWindow): JsonObject {
  return {
    key: window.key,
    label: window.label,
    ...(window.utilization === undefined
      ? {}
      : { utilization: window.utilization }),
    ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
  };
}

/**
 * The mutation payload minus `capturedAt`, so it doubles as the dedup key.
 *
 * `providerAccountId` is omitted when empty rather than sent blank: it is part
 * of the row's key, and the shared-team-credential row is the one with no
 * account at all.
 */
export function buildUsageLimitReportArgs(
  repoId: string,
  provider: UsageLimitProvider,
  providerAccountId: string,
  snapshot: UsageLimitSnapshot,
): JsonObject {
  return {
    repoId,
    provider,
    completeness: snapshot.completeness,
    ...(providerAccountId ? { providerAccountId } : {}),
    ...(snapshot.subscriptionType === undefined
      ? {}
      : { subscriptionType: snapshot.subscriptionType }),
    ...(snapshot.status === undefined ? {} : { status: snapshot.status }),
    ...(snapshot.windows === undefined
      ? {}
      : { windows: snapshot.windows.map(windowToJson) }),
  };
}

async function reportUsageLimits(
  provider: UsageLimitProvider,
  force = false,
): Promise<void> {
  const snapshot = S.usageLimitSnapshot;
  if (!snapshot) return;
  if (!REPO_ID) {
    log("usage limits: no REPO_ID in the environment — not reporting");
    return;
  }
  const args = buildUsageLimitReportArgs(
    REPO_ID,
    provider,
    PROVIDER_ACCOUNT_ID,
    snapshot,
  );
  const fingerprint = JSON.stringify(args);
  const capturedAt = Date.now();
  if (
    !force &&
    fingerprint === S.lastReportedUsageLimits &&
    capturedAt - S.lastReportedUsageLimitsAt < USAGE_REPORT_REFRESH_MS
  ) {
    return;
  }
  S.lastReportedUsageLimits = fingerprint;
  try {
    await callConvexWithRetry(
      "mutation",
      REPORT_MUTATION,
      { ...args, capturedAt },
      REPORT_MAX_RETRIES,
    );
    S.lastReportedUsageLimitsAt = capturedAt;
  } catch (error) {
    S.lastReportedUsageLimits = "";
    S.lastReportedUsageLimitsAt = 0;
    const messageText = error instanceof Error ? error.message : String(error);
    log("usage limits: report failed — " + messageText);
  }
}

/** Captures Claude's authoritative usage view and reports it in that order. */
export async function captureAndReportClaudeUsage(
  input: ClaudeUsageReportInput,
): Promise<void> {
  const captured = await captureClaudeUsage(
    input.readUsage,
    input.force === true,
  );
  captureClaudeUsageLimitError(input.error);
  if (input.force === true && !captured) return;
  await reportUsageLimits("claude", input.force === true);
}

/** Starts the one-shot report without delaying the user-visible completion. */
export function startClaudeUsageReport(input: ClaudeUsageReportInput): void {
  const report = captureAndReportClaudeUsage(input);
  pendingClaudeUsageReport = report;
  void report.finally(() => {
    if (pendingClaudeUsageReport === report) pendingClaudeUsageReport = null;
  });
}

/** Gives a one-shot report a bounded chance to land before `process.exit(0)`. */
export async function waitForPendingClaudeUsageReport(): Promise<void> {
  const pending = pendingClaudeUsageReport;
  if (!pending) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    pending,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, USAGE_REPORT_EXIT_GRACE_MS);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
}
