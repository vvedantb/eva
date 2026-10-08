import type { FunctionReturnType } from "convex/server";
import { getAIModelProvider, type api, type Id } from "@eva/backend";

/**
 * One credential the viewer can run on, with its latest reading or `null` when
 * it has never reported (or reported too long ago to be evidence of anything).
 * Every account is an entry, so the card lists a credential before its first
 * turn rather than only after one.
 */
export type UsageAccountEntry = FunctionReturnType<
  typeof api.usageLimits.getForViewer
>[number];

/**
 * One reading, flattened onto the account it belongs to — the shape every chip
 * and tone helper reads. Derived from the query's return type rather than
 * restated, so a schema change fails here instead of drifting, while still
 * letting a test build one from a literal.
 */
export type UsageSnapshot = NonNullable<UsageAccountEntry["reading"]> & {
  providerAccountId?: UsageAccountEntry["providerAccountId"];
  accountLabel?: UsageAccountEntry["accountLabel"];
};

export type UsageWindow = NonNullable<UsageSnapshot["windows"]>[number];

/** The entry's reading as a snapshot, or nothing when it has none. */
export function snapshotOf(
  entry: UsageAccountEntry,
): UsageSnapshot | undefined {
  const reading = entry.reading;
  if (reading === null) return undefined;
  return {
    ...reading,
    providerAccountId: entry.providerAccountId,
    accountLabel: entry.accountLabel,
  };
}

/**
 * The readings among a list of accounts. The chip measures readings, not
 * credentials, so an account that has never reported simply is not in it.
 */
export function snapshotsOf(
  entries: readonly UsageAccountEntry[],
): UsageSnapshot[] {
  return entries.flatMap((entry) => {
    const snapshot = snapshotOf(entry);
    return snapshot === undefined ? [] : [snapshot];
  });
}

/**
 * The one credential a surface's usage belongs to. Branded rather than a bare
 * string because the refresh action reads the account with it — a surface that
 * cannot name its account cannot ask for a reading either.
 */
export interface UsageAccountScope {
  /** null is the shared team credential, which has no account row. */
  providerAccountId: Id<"userProviderAccounts"> | null;
  accountLabel: string;
}

/**
 * Plan-usage chip bar is a Claude reading. Cursor/Codex/OpenCode chats still
 * have a sticky account id; scoping the bar by that id would paint Claude's
 * number beside the wrong picker. The popover still lists every account.
 */
export function claudeUsageAccountScope(
  model: string | null | undefined,
  scope: UsageAccountScope,
): UsageAccountScope | undefined {
  if (getAIModelProvider(model) !== "claude") return undefined;
  return scope;
}

/** Utilisation at which a window stops reading as routine. */
const WARNING_UTILIZATION = 80;
/** Utilisation at which it reads as about to be refused. */
const DANGER_UTILIZATION = 95;
/** Mirrors the server-side freshness gate in `usageLimits.getForViewer`. */
const USAGE_READING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type UsageTone = "neutral" | "warning" | "danger";

const TONE_ORDER: UsageTone[] = ["neutral", "warning", "danger"];

/** Text colour for a tone. One place, so chip and rows cannot disagree. */
export const USAGE_TONE_TEXT_CLASS: Record<UsageTone, string> = {
  neutral: "text-muted-foreground",
  warning: "text-warning",
  danger: "text-destructive",
};

/** Bar fill for a tone. `primary` is user-themed, so it is never hardcoded. */
export const USAGE_TONE_FILL_CLASS: Record<UsageTone, string> = {
  neutral: "bg-primary",
  warning: "bg-warning",
  danger: "bg-destructive",
};

export function toneForUtilization(utilization: number): UsageTone {
  if (utilization >= DANGER_UTILIZATION) return "danger";
  if (utilization >= WARNING_UTILIZATION) return "warning";
  return "neutral";
}

/** The provider's own verdict, which is all a windowless reading reports. */
function toneForStatus(status: UsageSnapshot["status"]): UsageTone {
  if (status === "rejected") return "danger";
  if (status === "allowed_warning") return "warning";
  return "neutral";
}

/**
 * The more severe of two tones. A provider can warn while every window it
 * reports still sits low, and that warning is the part worth surfacing.
 */
export function worseTone(a: UsageTone, b: UsageTone): UsageTone {
  return TONE_ORDER.indexOf(a) >= TONE_ORDER.indexOf(b) ? a : b;
}

/** Windows worth a row: one with no utilisation has nothing to draw. */
export function reportedWindows(
  snapshot: UsageSnapshot,
  now: number,
): UsageWindow[] {
  return (snapshot.windows ?? []).filter(
    (window) =>
      window.utilization !== undefined &&
      (window.resetsAt === undefined || window.resetsAt > now),
  );
}

/**
 * Windows that meter spend beyond the plan rather than headroom within it.
 * They still earn a row in the card — money spent is worth seeing — but they
 * are not a constraint, so a full overage meter must not colour the chip as if
 * the plan were about to refuse work.
 */
const SPEND_METER_WINDOW_KEYS: ReadonlySet<string> = new Set([
  "overage",
  "seven_day_overage_included",
]);

/** The tightest constraint the snapshot reports, if it reports any. */
export function maxUtilization(
  snapshot: UsageSnapshot,
  now: number,
): number | undefined {
  const utilizations = reportedWindows(snapshot, now)
    .filter((window) => !SPEND_METER_WINDOW_KEYS.has(window.key))
    .map((window) => window.utilization ?? 0);
  return utilizations.length === 0 ? undefined : Math.max(...utilizations);
}

/** Status remains meaningful until its associated windows have all reset. */
function activeUsageStatus(
  snapshot: UsageSnapshot,
  now: number,
): UsageSnapshot["status"] {
  const windows = snapshot.windows ?? [];
  if (windows.length === 0) return snapshot.status;
  const hasUnexpiredWindow = windows.some(
    (window) => window.resetsAt === undefined || window.resetsAt > now,
  );
  return hasUnexpiredWindow ? snapshot.status : undefined;
}

export function formatUtilization(utilization: number): string {
  return `${Math.round(utilization)}%`;
}

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * Time still to run on a window, at the coarsest useful granularity: "2d 23h",
 * "2h 28m", "45m". Deliberately not `formatDurationCompactMs`, which has no day
 * unit — a weekly window would read "167h 12m" there, and its other callers
 * measure agent work, where hours are the right ceiling.
 *
 * Rounds the smallest shown unit UP, carrying, so a countdown never claims a
 * reset lands sooner than it does (and never reads "0m" with time left).
 */
export function formatResetDistanceMs(ms: number): string {
  const totalMinutes = Math.ceil(ms / MINUTE_MS);
  if (totalMinutes < MINUTES_PER_HOUR) return `${totalMinutes}m`;
  if (totalMinutes < MINUTES_PER_DAY) {
    const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
    const minutes = totalMinutes % MINUTES_PER_HOUR;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const totalHours = Math.ceil(totalMinutes / MINUTES_PER_HOUR);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/** "resets in 2h 15m", or the moment it has already passed. */
export function resetsInLabel(resetsAt: number, now: number): string {
  const remaining = resetsAt - now;
  return remaining <= 0
    ? "resets now"
    : `resets in ${formatResetDistanceMs(remaining)}`;
}

export interface ChipSummary {
  label: string;
  /** Fill for the chip's meter; absent when the provider reports no windows. */
  utilization?: number;
  tone: UsageTone;
}

/**
 * Anthropic's model-scoped weekly display name for the active Eva model, when
 * one exists (Fable → "Fable"). Used to pick the chip bar's window.
 */
export function scopedWeeklyNameForModel(
  model: string | null | undefined,
): string | undefined {
  if (!model) return undefined;
  const lower = model.toLowerCase();
  if (lower.includes("fable")) return "Fable";
  if (lower.includes("opus")) return "Opus";
  if (lower.includes("sonnet")) return "Sonnet";
  return undefined;
}

function windowMatchesScopedName(windowKey: string, name: string): boolean {
  if (name === "Opus" && windowKey === "seven_day_opus") return true;
  if (name === "Sonnet" && windowKey === "seven_day_sonnet") return true;
  if (!windowKey.startsWith("model_scoped:")) return false;
  const scoped = windowKey.slice("model_scoped:".length);
  return (
    scoped === name ||
    scoped.startsWith(`${name} `) ||
    scoped.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Chip bar for the open chat: the active account's reading, preferring the
 * weekly window that meters the selected model (Weekly Fable on Fable, etc.).
 * Falls back to that account's tightest window when the model has no scoped
 * bucket (or none has been reported yet).
 */
export function chipSummaryForActive(
  rows: readonly UsageSnapshot[],
  now: number,
  model: string | null | undefined,
): ChipSummary | undefined {
  const scopedName = scopedWeeklyNameForModel(model);
  if (scopedName) {
    let match: { utilization: number; tone: UsageTone } | undefined;
    for (const row of rows) {
      if (now - row.capturedAt > USAGE_READING_MAX_AGE_MS) continue;
      for (const window of reportedWindows(row, now)) {
        if (window.utilization === undefined) continue;
        if (!windowMatchesScopedName(window.key, scopedName)) continue;
        if (match === undefined || window.utilization > match.utilization) {
          match = {
            utilization: window.utilization,
            tone: worseTone(
              toneForStatus(activeUsageStatus(row, now)),
              toneForUtilization(window.utilization),
            ),
          };
        }
      }
    }
    if (match) {
      return {
        label: formatUtilization(match.utilization),
        utilization: match.utilization,
        tone: match.tone,
      };
    }
  }
  return chipSummary(rows, now);
}

/**
 * What the collapsed chip says: the plan windows, which are the real
 * constraint. A reading without any still matters when the provider flagged it,
 * and returning nothing is how the whole feature stays invisible until a turn
 * has reported something.
 *
 * The number is the tightest constraint anywhere in the card — the highest
 * utilisation across every account, not the freshest row's. One chip stands in
 * for several accounts, so the one closest to being refused is the one worth
 * showing; and its tone also carries any other account's flagged status, which
 * would otherwise be hidden behind a collapsed card.
 */
export function chipSummary(
  rows: readonly UsageSnapshot[],
  now: number,
): ChipSummary | undefined {
  let tightest: number | undefined;
  let tone: UsageTone = "neutral";
  for (const row of rows) {
    if (now - row.capturedAt > USAGE_READING_MAX_AGE_MS) continue;
    tone = worseTone(tone, toneForStatus(activeUsageStatus(row, now)));
    const utilization = maxUtilization(row, now);
    if (utilization === undefined) continue;
    if (tightest === undefined || utilization > tightest) {
      tightest = utilization;
    }
    tone = worseTone(tone, toneForUtilization(utilization));
  }
  if (tightest !== undefined) {
    return { label: formatUtilization(tightest), utilization: tightest, tone };
  }
  const flagged = rows.find(
    (row) =>
      now - row.capturedAt <= USAGE_READING_MAX_AGE_MS &&
      toneForStatus(activeUsageStatus(row, now)) !== "neutral",
  );
  if (!flagged) return undefined;
  return {
    label: flagged.status === "rejected" ? "Limit reached" : "Near limit",
    tone: toneForStatus(activeUsageStatus(flagged, now)),
  };
}

/** Only the selected credential's limits belong beside its model picker. */
export function usageRowsForAccount<Row extends { providerAccountId?: string }>(
  rows: readonly Row[],
  /** Only the id is read here, so a `UsageAccountScope` is more than enough. */
  scope: { providerAccountId: string | null } | undefined,
): Row[] {
  if (!scope) return [...rows];
  const providerAccountId = scope.providerAccountId ?? undefined;
  return rows.filter((row) => row.providerAccountId === providerAccountId);
}

type UsageProvider = UsageSnapshot["provider"];

/**
 * Display name per provider. A record rather than a ternary, so adding a
 * provider to the Convex validator fails to compile until it gets a name.
 */
const PROVIDER_LABELS: Record<UsageProvider, string> = { claude: "Claude" };

/** "Claude · Max plan" — the plan half is dropped for an API-key session. */
export function providerHeading(snapshot: UsageSnapshot): string {
  const provider = PROVIDER_LABELS[snapshot.provider];
  const plan = snapshot.subscriptionType;
  if (!plan) return provider;
  return `${provider} · ${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan`;
}

/** The freshest reading across providers, for the card's single footer. */
export function newestCapturedAt(
  rows: readonly UsageSnapshot[],
): number | undefined {
  return rows.reduce<number | undefined>(
    (newest, row) =>
      newest === undefined || row.capturedAt > newest ? row.capturedAt : newest,
    undefined,
  );
}

/** The freshest reading for the account, or none within the freshness window. */
function freshestReading(
  rows: readonly UsageSnapshot[],
  now: number,
): UsageSnapshot | undefined {
  let freshest: UsageSnapshot | undefined;
  for (const row of rows) {
    if (now - row.capturedAt > USAGE_READING_MAX_AGE_MS) continue;
    if (freshest === undefined || row.capturedAt > freshest.capturedAt) {
      freshest = row;
    }
  }
  return freshest;
}

/**
 * Hover copy when the selected account has nothing to draw. Which of the
 * several "nothing to draw" states we are in is reported by the row, not
 * inferred here: a windowless reading used to be read off its timestamp, which
 * could not tell "Claude has no plan windows" from "Claude declined to say".
 *
 * `completeness` is absent on rows written before the discriminant, and on a
 * reading whose windows have all since reset.
 */
export function emptyAccountUsageCopy(
  rows: readonly UsageSnapshot[],
  now: number,
): string {
  const freshest = freshestReading(rows, now);
  if (!freshest) return "No plan usage has been reported for this account yet.";
  switch (freshest.completeness) {
    case "complete":
      // We asked, Claude answered in full, and there were no plan windows in it
      // (Team/Enterprise spend caps live on claude.ai).
      return "Claude isn't reporting plan rate limits for this account.";
    case "refused":
      return "Claude declined to report plan rate limits for this account.";
    case "partial":
    default:
      // Something was observed in passing, or the row predates the
      // discriminant — either way we never had the full picture.
      return "Plan usage for this account hasn't been fully reported yet.";
  }
}
