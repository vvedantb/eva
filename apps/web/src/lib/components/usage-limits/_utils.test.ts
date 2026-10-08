import { expect, test } from "vitest";
import {
  chipSummary,
  chipSummaryForActive,
  emptyAccountUsageCopy,
  formatResetDistanceMs,
  maxUtilization,
  newestCapturedAt,
  providerHeading,
  reportedWindows,
  resetsInLabel,
  scopedWeeklyNameForModel,
  snapshotsOf,
  toneForUtilization,
  type UsageSnapshot,
  usageRowsForAccount,
  worseTone,
  claudeUsageAccountScope,
} from "./_utils";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 1_700_000_000_000;

function claude(overrides: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return {
    provider: "claude",
    capturedAt: NOW - 5 * 60 * 1000,
    subscriptionType: "max",
    status: "allowed",
    windows: [
      { key: "5h", label: "5h", utilization: 42 },
      { key: "week", label: "Weekly (all models)", utilization: 62 },
    ],
    ...overrides,
  };
}

test("tone buckets sit on the 80 and 95 thresholds", () => {
  expect(toneForUtilization(79.9)).toBe("neutral");
  expect(toneForUtilization(80)).toBe("warning");
  expect(toneForUtilization(94.9)).toBe("warning");
  expect(toneForUtilization(95)).toBe("danger");
});

test("a reported status is never softened by a low window", () => {
  // The provider's own warning is the part worth surfacing, not the 42% bar.
  expect(worseTone("neutral", "warning")).toBe("warning");
  expect(chipSummary([claude({ status: "allowed_warning" })], NOW)?.tone).toBe(
    "warning",
  );
  expect(chipSummary([claude({ status: "rejected" })], NOW)?.tone).toBe(
    "danger",
  );
});

test("the chip shows the tightest window across a Claude row", () => {
  expect(maxUtilization(claude(), NOW)).toBe(62);
  expect(chipSummary([claude()], NOW)).toEqual({
    label: "62%",
    utilization: 62,
    tone: "neutral",
  });
});

test("windows with no utilisation are skipped, not drawn at zero", () => {
  const snapshot = claude({
    windows: [
      { key: "5h", label: "5h", utilization: 30 },
      { key: "opus", label: "Weekly (Opus)" },
    ],
  });
  expect(reportedWindows(snapshot, NOW).map((w) => w.key)).toEqual(["5h"]);
  expect(maxUtilization(claude({ windows: [] }), NOW)).toBeUndefined();
  expect(maxUtilization(claude({ windows: undefined }), NOW)).toBeUndefined();
});

test("a spend meter is shown but never stands in for plan headroom", () => {
  // Extra usage bills money; it does not measure how close the plan is to
  // refusing work, so a maxed-out meter must not become the headline number.
  const snapshot = claude({
    windows: [
      { key: "five_hour", label: "5h", utilization: 20 },
      { key: "overage", label: "Extra usage", utilization: 100 },
      {
        key: "seven_day_overage_included",
        label: "Weekly (overage included)",
        utilization: 97,
      },
    ],
  });
  expect(maxUtilization(snapshot, NOW)).toBe(20);
  expect(chipSummary([snapshot], NOW)).toEqual({
    label: "20%",
    utilization: 20,
    tone: "neutral",
  });
  // The rows themselves are untouched — the card still shows the spend.
  expect(reportedWindows(snapshot, NOW)).toHaveLength(3);
});

test("a reading of nothing but spend has no headline to show", () => {
  expect(
    maxUtilization(
      claude({
        windows: [{ key: "overage", label: "Extra usage", utilization: 60 }],
      }),
      NOW,
    ),
  ).toBeUndefined();
});

test("the chip shows the tightest window across every account, not the freshest", () => {
  // Two Claude accounts on one repo. The newer row is the roomier one, so a
  // first-match chip would have understated how close the other is to refusal.
  const roomy = claude({
    capturedAt: NOW,
    windows: [{ key: "5h", label: "5h", utilization: 18 }],
  });
  const tight = claude({
    capturedAt: NOW - 60_000,
    windows: [{ key: "5h", label: "5h", utilization: 83 }],
  });
  expect(chipSummary([roomy, tight], NOW)).toEqual({
    label: "83%",
    utilization: 83,
    tone: "warning",
  });
});

test("one account's flagged status colours the chip the whole card shares", () => {
  // The collapsed chip stands in for every account, so a rejection sitting
  // behind a lower utilisation must not be hidden by it.
  const calm = claude({
    windows: [{ key: "5h", label: "5h", utilization: 70 }],
  });
  const rejected = claude({
    status: "rejected",
    windows: [{ key: "5h", label: "5h", utilization: 12 }],
  });
  expect(chipSummary([calm, rejected], NOW)).toEqual({
    label: "70%",
    utilization: 70,
    tone: "danger",
  });
});

test("account-scoped usage never falls back to another credential", () => {
  const team = { providerAccountId: undefined, label: "team" };
  const kezia = { providerAccountId: "account-kezia", label: "kezia" };
  const rows = [team, kezia];

  expect(
    usageRowsForAccount(rows, { providerAccountId: "account-kezia" }),
  ).toEqual([kezia]);
  expect(usageRowsForAccount(rows, { providerAccountId: null })).toEqual([
    team,
  ]);
  expect(
    usageRowsForAccount([team], { providerAccountId: "account-kezia" }),
  ).toEqual([]);
});

test("plan-usage chip scope is omitted on non-Claude models", () => {
  const team = { providerAccountId: null, accountLabel: "Team" };
  expect(claudeUsageAccountScope("claude:sonnet", team)).toEqual(team);
  expect(claudeUsageAccountScope("cursor:grok-4.6", team)).toBeUndefined();
  expect(claudeUsageAccountScope("codex:gpt-5.5", team)).toBeUndefined();
  expect(claudeUsageAccountScope("opencode:openai/gpt-5.4", team)).toBeUndefined();
});

test("scoped weekly name follows the active Claude model", () => {
  expect(scopedWeeklyNameForModel("claude:claude-fable-5")).toBe("Fable");
  expect(scopedWeeklyNameForModel("claude:claude-opus-4-6")).toBe("Opus");
  expect(scopedWeeklyNameForModel("claude:claude-sonnet-4-6")).toBe("Sonnet");
  expect(scopedWeeklyNameForModel("cursor:grok-4.6")).toBeUndefined();
});

test("chip bar prefers Weekly (Fable) when the active model is Fable", () => {
  const row = claude({
    windows: [
      { key: "five_hour", label: "5h", utilization: 90 },
      { key: "seven_day", label: "Weekly (all models)", utilization: 40 },
      { key: "model_scoped:Fable", label: "Weekly (Fable)", utilization: 12 },
    ],
  });
  expect(chipSummaryForActive([row], NOW, "claude:claude-fable-5")).toEqual({
    label: "12%",
    utilization: 12,
    tone: "neutral",
  });
  expect(chipSummaryForActive([row], NOW, "claude:claude-sonnet-4-6")?.utilization).toBe(
    90,
  );
});

test("the scoped bar matches Anthropic's versioned display name", () => {
  // `/usage` names the window "Opus 5", not "Opus" — an exact-match lookup
  // silently falls back to the tightest window instead of the model's own.
  const row = claude({
    windows: [
      { key: "five_hour", label: "5h", utilization: 88 },
      { key: "model_scoped:Opus 5", label: "Weekly (Opus 5)", utilization: 31 },
    ],
  });
  expect(
    chipSummaryForActive([row], NOW, "claude:claude-opus-4-6")?.utilization,
  ).toBe(31);
});

test("the scoped bar also reads the fixed per-model weekly keys", () => {
  // Opus and Sonnet arrive as their own top-level windows, not as model_scoped.
  const row = claude({
    windows: [
      { key: "five_hour", label: "5h", utilization: 88 },
      { key: "seven_day_opus", label: "Weekly (Opus)", utilization: 24 },
      { key: "seven_day_sonnet", label: "Weekly (Sonnet)", utilization: 51 },
    ],
  });
  expect(
    chipSummaryForActive([row], NOW, "claude:claude-opus-4-6")?.utilization,
  ).toBe(24);
  expect(
    chipSummaryForActive([row], NOW, "claude:claude-sonnet-4-6")?.utilization,
  ).toBe(51);
});

test("a reading too old for the chip is too old for the scoped bar", () => {
  // The scoped lookup runs before the plain chip, so it needs the same
  // freshness gate or a day-old Fable number outlives every other reading.
  const stale = claude({
    capturedAt: NOW - DAY - 1,
    windows: [
      { key: "model_scoped:Fable", label: "Weekly (Fable)", utilization: 77 },
    ],
  });
  expect(
    chipSummaryForActive([stale], NOW, "claude:claude-fable-5"),
  ).toBeUndefined();
});

test("an expired scoped window stops driving the bar", () => {
  const row = claude({
    windows: [
      { key: "five_hour", label: "5h", utilization: 44 },
      {
        key: "model_scoped:Fable",
        label: "Weekly (Fable)",
        utilization: 99,
        resetsAt: NOW - 1,
      },
    ],
  });
  expect(chipSummaryForActive([row], NOW, "claude:claude-fable-5")).toEqual({
    label: "44%",
    utilization: 44,
    tone: "neutral",
  });
});

test("a windowless rejection still colours a chip that has a number", () => {
  // Account A reports utilisation; account B was refused before it could
  // report any window. B's rejection must reach the shared chip's tone.
  const measured = claude({
    windows: [{ key: "5h", label: "5h", utilization: 40 }],
  });
  const rejectedNoWindows: UsageSnapshot = {
    provider: "claude",
    capturedAt: NOW,
    status: "rejected",
  };
  expect(chipSummary([measured, rejectedNoWindows], NOW)).toEqual({
    label: "40%",
    utilization: 40,
    tone: "danger",
  });
});

test("only the accounts that have reported become snapshots", () => {
  // Every credential the viewer can run on is an entry, so the card can list an
  // account before its first turn. The chip measures readings, not accounts.
  const reading = {
    provider: "claude" as const,
    capturedAt: NOW,
    windows: [{ key: "five_hour", label: "5h", utilization: 12 }],
  };
  const snapshots = snapshotsOf([
    { providerAccountId: undefined, accountLabel: "Kezia", reading: null },
    { providerAccountId: undefined, accountLabel: "Team", reading },
  ]);
  // The account the reading belongs to travels with it — the chip scopes on it.
  expect(snapshots).toEqual([
    { ...reading, providerAccountId: undefined, accountLabel: "Team" },
  ]);
  expect(chipSummary(snapshots, NOW)?.label).toBe("12%");
  expect(snapshotsOf([])).toEqual([]);
});

test("a flagged reading still shows even with nothing to measure", () => {
  expect(
    chipSummary(
      [{ provider: "claude", capturedAt: NOW, status: "rejected" }],
      NOW,
    ),
  ).toEqual({ label: "Limit reached", tone: "danger" });
  expect(
    chipSummary(
      [{ provider: "claude", capturedAt: NOW, status: "allowed_warning" }],
      NOW,
    )?.label,
  ).toBe("Near limit");
});

test("nothing to show renders nothing at all", () => {
  expect(chipSummary([], NOW)).toBeUndefined();
  expect(
    chipSummary(
      [{ provider: "claude", capturedAt: NOW, status: "allowed" }],
      NOW,
    ),
  ).toBeUndefined();
});

test("expired windows and old readings stop affecting the chip", () => {
  const reset = claude({
    status: "rejected",
    windows: [
      {
        key: "5h",
        label: "5h",
        utilization: 100,
        resetsAt: NOW - 1,
      },
    ],
  });
  expect(chipSummary([reset], NOW)).toBeUndefined();
  expect(
    chipSummary([claude({ capturedAt: NOW - DAY - 1 })], NOW),
  ).toBeUndefined();
});

test("reset labels count down, and stop at the reset", () => {
  expect(resetsInLabel(NOW + 2 * HOUR + 15 * 60 * 1000, NOW)).toBe(
    "resets in 2h 15m",
  );
  expect(resetsInLabel(NOW + 9 * 60 * 1000, NOW)).toBe("resets in 9m");
  expect(resetsInLabel(NOW - 1000, NOW)).toBe("resets now");
});

test("a reset more than a day out is counted in days, not raw hours", () => {
  expect(formatResetDistanceMs(2 * DAY + 23 * HOUR)).toBe("2d 23h");
  expect(formatResetDistanceMs(6 * DAY + 12 * HOUR)).toBe("6d 12h");
  // Whole days drop the "0h", and the last minutes of a day roll up into it.
  expect(formatResetDistanceMs(3 * DAY)).toBe("3d");
  expect(formatResetDistanceMs(DAY - 30 * 1000)).toBe("1d");
  expect(resetsInLabel(NOW + 2 * DAY + 23 * HOUR, NOW)).toBe(
    "resets in 2d 23h",
  );
});

test("under a day stays on hours and minutes, under an hour on minutes", () => {
  expect(formatResetDistanceMs(23 * HOUR + 59 * 60 * 1000)).toBe("23h 59m");
  expect(formatResetDistanceMs(2 * HOUR + 28 * 60 * 1000)).toBe("2h 28m");
  expect(formatResetDistanceMs(2 * HOUR)).toBe("2h");
  expect(formatResetDistanceMs(45 * 60 * 1000)).toBe("45m");
  // Rounding up keeps a live countdown off "0m" while time remains.
  expect(formatResetDistanceMs(30 * 1000)).toBe("1m");
});

test("the provider heading names the plan only when there is one", () => {
  expect(providerHeading(claude())).toBe("Claude · Max plan");
  expect(providerHeading(claude({ subscriptionType: undefined }))).toBe(
    "Claude",
  );
});

test("the footer stamps the freshest reading of the lot", () => {
  const freshest = claude({ capturedAt: NOW });
  expect(newestCapturedAt([claude(), freshest])).toBe(NOW);
  expect(newestCapturedAt([])).toBeUndefined();
});

test("account hover copy distinguishes never-reported from windowless", () => {
  expect(emptyAccountUsageCopy([], NOW)).toBe(
    "No plan usage has been reported for this account yet.",
  );
  expect(
    emptyAccountUsageCopy(
      [
        claude({
          capturedAt: NOW - 2 * DAY,
          windows: [],
          completeness: "complete",
        }),
      ],
      NOW,
    ),
  ).toBe("No plan usage has been reported for this account yet.");
});

test("account hover copy reads the reason off the row, not the clock", () => {
  // Every row below is fresh and windowless — the timestamp cannot tell these
  // three apart, which is why the reading carries the reason.
  expect(
    emptyAccountUsageCopy(
      [claude({ windows: [], completeness: "complete" })],
      NOW,
    ),
  ).toBe("Claude isn't reporting plan rate limits for this account.");
  expect(
    emptyAccountUsageCopy(
      [claude({ windows: [], completeness: "refused" })],
      NOW,
    ),
  ).toBe("Claude declined to report plan rate limits for this account.");
  expect(
    emptyAccountUsageCopy(
      [claude({ windows: [], completeness: "partial" })],
      NOW,
    ),
  ).toBe("Plan usage for this account hasn't been fully reported yet.");
  // Rows written before the discriminant, and readings whose windows have all
  // reset, claim nothing about the provider.
  expect(
    emptyAccountUsageCopy(
      [claude({ windows: [], completeness: undefined })],
      NOW,
    ),
  ).toBe("Plan usage for this account hasn't been fully reported yet.");
});

test("account hover copy follows the freshest reading", () => {
  expect(
    emptyAccountUsageCopy(
      [
        claude({ capturedAt: NOW - HOUR, completeness: "complete" }),
        claude({ capturedAt: NOW - 60_000, completeness: "refused" }),
      ],
      NOW,
    ),
  ).toBe("Claude declined to report plan rate limits for this account.");
});
