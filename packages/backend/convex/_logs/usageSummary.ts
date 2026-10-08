import { computeCacheSavingsUsd } from "@eva/shared/modelPricing";

/** The denormalised columns `usage.summary` aggregates; JSON is never parsed here. */
export interface UsageRow {
  createdAt: number;
  costUsd?: number;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface UsageTotals {
  costUsd: number;
  cacheSavingsUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  completions: number;
  /** Completions whose model has no published rate; they add 0 to savings. */
  unpricedCompletions: number;
}

export interface UsageByModel extends UsageTotals {
  model: string;
  provider?: string;
}

export interface UsageBucket {
  bucketStart: number;
  model: string;
  costUsd: number;
  completions: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageSummary {
  totals: UsageTotals;
  byModel: UsageByModel[];
  buckets: UsageBucket[];
}

/** Label for rows written before the usage columns existed and not yet backfilled. */
export const UNKNOWN_MODEL = "unknown";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

function emptyTotals(): UsageTotals {
  return {
    costUsd: 0,
    cacheSavingsUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    completions: 0,
    unpricedCompletions: 0,
  };
}

function addRow(
  totals: UsageTotals,
  row: UsageRow,
  savings: number | null,
): void {
  totals.costUsd += row.costUsd ?? 0;
  totals.inputTokens += row.inputTokens ?? 0;
  totals.outputTokens += row.outputTokens ?? 0;
  totals.cacheReadTokens += row.cacheReadTokens ?? 0;
  totals.cacheCreationTokens += row.cacheCreationTokens ?? 0;
  totals.completions += 1;
  if (savings === null) {
    totals.unpricedCompletions += 1;
  } else {
    totals.cacheSavingsUsd += savings;
  }
}

/**
 * Start of the local-time bucket containing `createdAt`. Buckets are aligned
 * to the caller's UTC offset so a "day" bar is the user's calendar day, not
 * the UTC one. `tzOffsetMs` follows `Date.prototype.getTimezoneOffset`
 * (UTC minus local, so negative east of UTC) converted to milliseconds.
 */
export function bucketStartFor(
  createdAt: number,
  bucketMs: number,
  tzOffsetMs: number,
): number {
  return (
    Math.floor((createdAt - tzOffsetMs) / bucketMs) * bucketMs + tzOffsetMs
  );
}

/** Aggregates completion rows into period totals, a per-model table, and chart buckets. */
export function summariseUsage(
  rows: ReadonlyArray<UsageRow>,
  options: { bucketMs: number; tzOffsetMs: number },
): UsageSummary {
  const totals = emptyTotals();
  const byModel = new Map<string, UsageByModel>();
  const buckets = new Map<string, UsageBucket>();

  for (const row of rows) {
    const model = row.model ?? UNKNOWN_MODEL;
    // Null when the model has no published rate (or the row predates the
    // usage columns); such rows count as unpriced instead of adding zero.
    const savings =
      row.model === undefined
        ? null
        : computeCacheSavingsUsd(row.model, row.cacheReadTokens ?? 0);

    addRow(totals, row, savings);

    const modelTotals = byModel.get(model);
    if (modelTotals) {
      addRow(modelTotals, row, savings);
      if (modelTotals.provider === undefined && row.provider) {
        modelTotals.provider = row.provider;
      }
    } else {
      const fresh: UsageByModel = {
        model,
        provider: row.provider || undefined,
        ...emptyTotals(),
      };
      addRow(fresh, row, savings);
      byModel.set(model, fresh);
    }

    const bucketStart = bucketStartFor(
      row.createdAt,
      options.bucketMs,
      options.tzOffsetMs,
    );
    const key = `${bucketStart}:${model}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.costUsd += row.costUsd ?? 0;
      bucket.completions += 1;
      bucket.inputTokens += row.inputTokens ?? 0;
      bucket.outputTokens += row.outputTokens ?? 0;
    } else {
      buckets.set(key, {
        bucketStart,
        model,
        costUsd: row.costUsd ?? 0,
        completions: 1,
        inputTokens: row.inputTokens ?? 0,
        outputTokens: row.outputTokens ?? 0,
      });
    }
  }

  return {
    totals,
    byModel: Array.from(byModel.values()).sort(
      (a, b) => b.costUsd - a.costUsd,
    ),
    buckets: Array.from(buckets.values()).sort(
      (a, b) =>
        a.bucketStart - b.bucketStart || a.model.localeCompare(b.model),
    ),
  };
}
