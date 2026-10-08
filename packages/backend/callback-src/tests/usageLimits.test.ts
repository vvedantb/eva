import { beforeEach, expect, test, vi } from "vitest";
import { callbackState as S, resetStateForTests } from "../runtime/state.js";
import type {
  ConvexCallType,
  JsonObject,
  JsonValue,
  UsageLimitSnapshot,
} from "../types.js";
import {
  buildUsageLimitReportArgs,
  captureClaudeUsage,
  captureClaudeUsageLimitError,
  type ClaudeUsageResponseLike,
  mergeClaudeRateLimitEvent,
  readClaudeUsageWindows,
  readIsoMs,
  unwrapUsagePayload,
} from "../runtime/usageLimits.js";

/**
 * Breadcrumb mutations the module fires, captured instead of sent. Hoisted so
 * the `vi.mock` factory below (which runs before the imports) can reach it.
 */
const convexCalls = vi.hoisted(() => {
  const calls: { path: string; args: JsonObject }[] = [];
  return calls;
});

vi.mock("../http/convexClient.js", () => ({
  callConvexWithRetry: async (
    _type: ConvexCallType,
    path: string,
    args: JsonObject,
  ): Promise<JsonValue> => {
    convexCalls.push({ path, args });
    return null;
  },
}));

beforeEach(() => {
  resetStateForTests();
  convexCalls.length = 0;
});

/** A never-answering `/usage` lookup: the torn-down control channel. */
function neverAnswers(): Promise<ClaudeUsageResponseLike | null> {
  return new Promise<ClaudeUsageResponseLike | null>(() => {});
}

test("mergeClaudeRateLimitEvent labels the window and converts epoch seconds", () => {
  mergeClaudeRateLimitEvent({
    type: "rate_limit_event",
    rate_limit_info: {
      status: "allowed_warning",
      rateLimitType: "five_hour",
      utilization: 82.5,
      resetsAt: 1_770_000_000,
    },
  });
  expect(S.usageLimitSnapshot).toEqual({
    completeness: "partial",
    status: "allowed_warning",
    windows: [
      {
        key: "five_hour",
        label: "5h",
        utilization: 82.5,
        resetsAt: 1_770_000_000_000,
      },
    ],
  });
});

test("mergeClaudeRateLimitEvent merges per window without clobbering the others", () => {
  mergeClaudeRateLimitEvent({
    rate_limit_info: {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 10,
    },
  });
  mergeClaudeRateLimitEvent({
    rate_limit_info: {
      status: "allowed",
      rateLimitType: "seven_day_opus",
      utilization: 40,
    },
  });
  // A second reading for a window already seen replaces only that window.
  mergeClaudeRateLimitEvent({
    rate_limit_info: {
      status: "rejected",
      rateLimitType: "five_hour",
      utilization: 100,
    },
  });
  expect(S.usageLimitSnapshot).toEqual({
    completeness: "partial",
    status: "rejected",
    windows: [
      { key: "five_hour", label: "5h", utilization: 100 },
      { key: "seven_day_opus", label: "Weekly (Opus)", utilization: 40 },
    ],
  });
});

test("mergeClaudeRateLimitEvent maps seven_day_oi to Weekly (Fable)", () => {
  mergeClaudeRateLimitEvent({
    rate_limit_info: {
      status: "allowed",
      rateLimitType: "seven_day_oi",
      utilization: 12,
      resetsAt: 1_770_000_000,
    },
  });
  expect(S.usageLimitSnapshot?.windows).toEqual([
    {
      key: "model_scoped:Fable",
      label: "Weekly (Fable)",
      utilization: 12,
      resetsAt: 1_770_000_000_000,
    },
  ]);
});

test("mergeClaudeRateLimitEvent ignores payloads it cannot read", () => {
  mergeClaudeRateLimitEvent({ type: "rate_limit_event" });
  mergeClaudeRateLimitEvent({ rate_limit_info: "nope" });
  mergeClaudeRateLimitEvent({ rate_limit_info: { status: "unheard-of" } });
  expect(S.usageLimitSnapshot).toBeNull();
});

test("mergeClaudeRateLimitEvent keeps an unknown window key as its own label", () => {
  mergeClaudeRateLimitEvent({
    rate_limit_info: { status: "allowed", rateLimitType: "ten_minute" },
  });
  expect(S.usageLimitSnapshot?.windows).toEqual([
    { key: "ten_minute", label: "ten_minute" },
  ]);
});

test("readIsoMs parses ISO timestamps and rejects everything else", () => {
  expect(readIsoMs("2026-08-22T10:00:00.000Z")).toBe(
    Date.parse("2026-08-22T10:00:00.000Z"),
  );
  expect(readIsoMs("not-a-date")).toBeUndefined();
  expect(readIsoMs(null)).toBeUndefined();
  expect(readIsoMs(undefined)).toBeUndefined();
  expect(readIsoMs(1_770_000_000)).toBeUndefined();
});

test("readClaudeUsageWindows builds every populated window in display order", () => {
  expect(
    readClaudeUsageWindows({
      subscription_type: "max",
      rate_limits_available: true,
      rate_limits: {
        five_hour: {
          utilization: 12,
          resets_at: "2026-08-22T10:00:00.000Z",
        },
        seven_day: { utilization: 55, resets_at: null },
        // Reported but entirely null — nothing to show, so no window.
        seven_day_opus: { utilization: null, resets_at: null },
        seven_day_sonnet: null,
        seven_day_overage_included: {
          utilization: 8,
          resets_at: "2026-08-29T00:00:00.000Z",
        },
        overage: { utilization: 1.03, resets_at: null },
        model_scoped: [
          { display_name: "Fable", utilization: 3, resets_at: null },
          // No display name means no label and no stable key.
          { utilization: 9, resets_at: null },
        ],
      },
    }),
  ).toEqual([
    {
      key: "five_hour",
      label: "5h",
      utilization: 12,
      resetsAt: Date.parse("2026-08-22T10:00:00.000Z"),
    },
    { key: "seven_day", label: "Weekly (all models)", utilization: 55 },
    {
      key: "seven_day_overage_included",
      label: "Weekly (overage included)",
      utilization: 8,
      resetsAt: Date.parse("2026-08-29T00:00:00.000Z"),
    },
    // A model-scoped window reads like its fixed-key siblings, not "Fable".
    { key: "model_scoped:Fable", label: "Weekly (Fable)", utilization: 3 },
    { key: "overage", label: "Extra usage", utilization: 1.03 },
  ]);
});

test("readClaudeUsageWindows is empty when the plan reports no limits", () => {
  expect(readClaudeUsageWindows(null)).toEqual([]);
  expect(readClaudeUsageWindows({ rate_limits: null })).toEqual([]);
});

test("a successful usage read replaces vanished windows and clears stream status", async () => {
  mergeClaudeRateLimitEvent({
    rate_limit_info: {
      status: "rejected",
      rateLimitType: "five_hour",
      utilization: 100,
    },
  });
  mergeClaudeRateLimitEvent({
    rate_limit_info: {
      status: "rejected",
      rateLimitType: "seven_day_opus",
      utilization: 95,
    },
  });

  await captureClaudeUsage(async () => ({
    subscription_type: "max",
    rate_limits_available: true,
    rate_limits: {
      five_hour: { utilization: 12, resets_at: null },
      seven_day_opus: null,
    },
  }));

  expect(S.usageLimitSnapshot).toEqual({
    completeness: "complete",
    subscriptionType: "max",
    windows: [{ key: "five_hour", label: "5h", utilization: 12 }],
  });
});

test("an unavailable usage read preserves the last observed plan windows", async () => {
  mergeClaudeRateLimitEvent({
    rate_limit_info: {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 12,
    },
  });

  await captureClaudeUsage(async () => ({
    rate_limits_available: false,
    rate_limits: null,
  }));

  expect(S.usageLimitSnapshot).toEqual({
    completeness: "partial",
    status: "allowed",
    windows: [{ key: "five_hour", label: "5h", utilization: 12 }],
  });
});

test("an unavailable usage read records a refusal instead of staying silent", async () => {
  await captureClaudeUsage(async () => ({
    rate_limits_available: false,
    rate_limits: null,
  }));
  // "refused" is its own state: the account still gets a Convex row and the UI
  // can say Claude declined, rather than guessing from an empty window list.
  // Not "complete" — that would wipe later windows if a subsequent turn treated
  // this as authoritative.
  expect(S.usageLimitSnapshot).toEqual({ completeness: "refused" });
});

test("a spend-limit result becomes a non-destructive rejected snapshot", () => {
  captureClaudeUsageLimitError(
    "You've hit your individual spend limit · ask your admin to raise it",
  );
  expect(S.usageLimitSnapshot).toEqual({
    completeness: "partial",
    status: "rejected",
  });
});

test("a session-limit result becomes a rejected snapshot", () => {
  captureClaudeUsageLimitError(
    "You've hit your session limit · resets 12pm (UTC)",
  );
  expect(S.usageLimitSnapshot).toEqual({
    completeness: "partial",
    status: "rejected",
  });
});

test("a spend-limit result keeps authoritative windows when available", async () => {
  await captureClaudeUsage(async () => ({
    subscription_type: "max",
    rate_limits_available: true,
    rate_limits: {
      five_hour: { utilization: 100, resets_at: null },
    },
  }));
  captureClaudeUsageLimitError("spend limit reached");
  expect(S.usageLimitSnapshot).toEqual({
    completeness: "complete",
    subscriptionType: "max",
    status: "rejected",
    windows: [{ key: "five_hour", label: "5h", utilization: 100 }],
  });
});

test("buildUsageLimitReportArgs omits every field the snapshot did not observe", () => {
  expect(
    buildUsageLimitReportArgs("repo-1", "claude", "account-1", {
      completeness: "complete",
      subscriptionType: "max",
      status: "allowed",
      windows: [{ key: "five_hour", label: "5h", utilization: 12 }],
    }),
  ).toEqual({
    repoId: "repo-1",
    provider: "claude",
    providerAccountId: "account-1",
    completeness: "complete",
    subscriptionType: "max",
    status: "allowed",
    windows: [{ key: "five_hour", label: "5h", utilization: 12 }],
  });
  // A reading with nothing but a status sends nothing but a status.
  expect(
    buildUsageLimitReportArgs("repo-1", "claude", "", {
      completeness: "partial",
      status: "rejected",
    }),
  ).toEqual({
    repoId: "repo-1",
    provider: "claude",
    completeness: "partial",
    status: "rejected",
  });
  // A refusal reaches the server as its own state, not as a partial.
  expect(
    buildUsageLimitReportArgs("repo-1", "claude", "", {
      completeness: "refused",
    }),
  ).toEqual({
    repoId: "repo-1",
    provider: "claude",
    completeness: "refused",
  });
});

test("buildUsageLimitReportArgs keys two accounts apart on one repo", () => {
  const snapshot: UsageLimitSnapshot = {
    completeness: "complete",
    subscriptionType: "max",
    status: "allowed",
  };
  const kezia = buildUsageLimitReportArgs("repo-1", "claude", "acc-a", {
    ...snapshot,
  });
  const team = buildUsageLimitReportArgs("repo-1", "claude", "acc-b", {
    ...snapshot,
  });
  // Identical readings on the same repo and provider must still differ, or the
  // dedup fingerprint would suppress the second account's report entirely.
  expect(kezia).not.toEqual(team);
  expect(kezia.providerAccountId).toBe("acc-a");
  // A run on the shared team credential sends no account at all.
  expect(
    "providerAccountId" in
      buildUsageLimitReportArgs("repo-1", "claude", "", { ...snapshot }),
  ).toBe(false);
});

test("unwrapUsagePayload reads a nested control-channel value", () => {
  const inner = {
    rate_limits_available: true,
    rate_limits: { five_hour: { utilization: 34 } },
  };
  expect(unwrapUsagePayload({ value: inner })).toEqual(inner);
});

test("a usage payload with windows and no availability flag still captures", async () => {
  await captureClaudeUsage(async () => ({
    subscription_type: "max",
    rate_limits: { five_hour: { utilization: 34, resets_at: null } },
  }));
  expect(S.usageLimitSnapshot).toEqual({
    completeness: "complete",
    subscriptionType: "max",
    windows: [{ key: "five_hour", label: "5h", utilization: 34 }],
  });
});

test("a nested usage payload still captures", async () => {
  await captureClaudeUsage(async () => ({
    value: {
      rate_limits_available: true,
      rate_limits: { five_hour: { utilization: 21, resets_at: null } },
    },
  }));
  expect(S.usageLimitSnapshot).toEqual({
    completeness: "complete",
    windows: [{ key: "five_hour", label: "5h", utilization: 21 }],
  });
});

test("unwrapUsagePayload keeps the outer reading when `value` carries none", () => {
  // Envelopes carry other metadata under `value` too. Unwrapping on the mere
  // presence of the key would throw away the reading sitting beside it.
  const enveloped = {
    rate_limits_available: true,
    rate_limits: { five_hour: { utilization: 12, resets_at: null } },
    value: {},
  };
  expect(unwrapUsagePayload(enveloped)).toBe(enveloped);
  expect(unwrapUsagePayload({ value: null })).toEqual({ value: null });
});

/**
 * The chip's refresh button asks a live daemon for a reading, and the SDK
 * answers only once it has initialized — which a cold query routinely takes
 * longer than the 5s budget a turn's best-effort telemetry gets. Sharing that
 * budget is what made the button appear to do nothing.
 */
test("an unforced usage lookup gives up at the turn budget and says nothing", async () => {
  vi.useFakeTimers();
  try {
    const capture = captureClaudeUsage(neverAnswers);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await capture).toBe(false);
    // Turn telemetry is silent by design: no breadcrumb, no Convex write.
    expect(convexCalls).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test("a forced refresh keeps waiting past the turn budget", async () => {
  vi.useFakeTimers();
  try {
    const capture = captureClaudeUsage(
      () =>
        new Promise<ClaudeUsageResponseLike | null>((resolve) => {
          setTimeout(
            () =>
              resolve({
                rate_limits_available: true,
                rate_limits: {
                  five_hour: { utilization: 61, resets_at: null },
                },
              }),
            9_000,
          );
        }),
      true,
    );

    await vi.advanceTimersByTimeAsync(6_000);
    // Past the unforced budget, and still waiting rather than reporting a miss.
    expect(S.usageLimitSnapshot).toBeNull();

    await vi.advanceTimersByTimeAsync(4_000);
    expect(await capture).toBe(true);
    expect(S.usageLimitSnapshot).toEqual({
      completeness: "complete",
      windows: [{ key: "five_hour", label: "5h", utilization: 61 }],
    });
    expect(convexCalls).toEqual([
      {
        path: "usageLimits:noteRefreshAttempt",
        args: { captured: true, available: true, detail: "complete" },
      },
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test("a forced refresh that never answers leaves a breadcrumb", async () => {
  vi.useFakeTimers();
  try {
    const capture = captureClaudeUsage(neverAnswers, true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await capture).toBe(false);
    // Without this the only record of a failed on-demand refresh was a log
    // line on the VM, which nobody sees once the sandbox is gone.
    expect(convexCalls).toEqual([
      {
        path: "usageLimits:noteRefreshAttempt",
        args: { captured: false, detail: "timeout" },
      },
    ]);
  } finally {
    vi.useRealTimers();
  }
});
