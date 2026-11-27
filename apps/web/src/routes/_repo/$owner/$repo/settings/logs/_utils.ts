import dayjs from "@eva/shared/dates";
import { parseResultEvent, formatCost, formatTokens } from "@/lib/utils/logs";

export { parseResultEvent, formatCost, formatTokens };

const ENTITY_TYPE_LABELS: Record<string, string> = {
  quickTask: "Quick Tasks",
  session: "Sessions",
  project: "Projects",
  "project-chat": "Project Chats",
  "task-chat": "Task Chats",
  doc: "Docs",
  evaluation: "Evaluations",
  summarize: "Summaries",
  testGen: "Test Generation",
  automation: "Automations",
};

export function labelFor(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

// Group key used by the "By Type" log view. Project-tagged entries (chats,
// tasks, interviews) collapse into a single "project" group so projects are
// billed as one line instead of split across project-chat + quickTask etc.
const PROJECT_GROUP_KEY = "project";

export function groupKeyFor(log: {
  entityType: string;
  projectId?: string;
}): string {
  return log.projectId !== undefined ? PROJECT_GROUP_KEY : log.entityType;
}

/** The subset of a log DTO the ledger needs to price a completion. */
export interface LogCostFields {
  entityType: string;
  projectId?: string;
  rawResultEvent?: string;
  costUsd?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

export interface LogUsage {
  costUsd: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/**
 * Usage for one completion from its denormalised columns, falling back to
 * the raw result event for rows written before the columns existed and not
 * yet backfilled. `costUsd` is the presence marker: the backend sets every
 * column together or none.
 */
export function usageOf(log: LogCostFields): LogUsage {
  if (log.costUsd !== undefined) {
    return {
      costUsd: log.costUsd,
      model: log.model ?? "-",
      inputTokens: log.inputTokens ?? 0,
      outputTokens: log.outputTokens ?? 0,
      durationMs: log.durationMs ?? 0,
    };
  }
  const parsed = parseResultEvent(log.rawResultEvent);
  return {
    costUsd: parsed.costUsd,
    model: parsed.model,
    inputTokens: parsed.inputTokens,
    outputTokens: parsed.outputTokens,
    durationMs: parsed.durationMs,
  };
}

export interface LogTotals {
  totalCost: number;
  totalInput: number;
  totalOutput: number;
  totalDuration: number;
}

/** Cost, tokens, and duration for a set of completions. */
export function logTotals(logs: ReadonlyArray<LogCostFields>): LogTotals {
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalDuration = 0;
  for (const log of logs) {
    const usage = usageOf(log);
    totalCost += usage.costUsd;
    totalInput += usage.inputTokens;
    totalOutput += usage.outputTokens;
    totalDuration += usage.durationMs;
  }
  return { totalCost, totalInput, totalOutput, totalDuration };
}

/** Completions rolled up by type, spend-desc. */
export function groupLogsByType<T extends LogCostFields>(
  logs: T[],
): Array<{ type: string; logs: T[]; total: number }> {
  const groups = new Map<string, { logs: T[]; total: number }>();
  for (const log of logs) {
    const key = groupKeyFor(log);
    const cost = usageOf(log).costUsd;
    const existing = groups.get(key);
    if (existing) {
      existing.logs.push(log);
      existing.total += cost;
    } else {
      groups.set(key, { logs: [log], total: cost });
    }
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([type, data]) => ({ type, ...data }));
}

export type UsageBucketSize = "hour" | "day";

/**
 * Every bucket start covering `[startTime, endTime)`, aligned to the local
 * bucket boundary the backend used (same `tzOffsetMs` convention as
 * `Date.prototype.getTimezoneOffset`). Empty buckets are included so the
 * chart shows gaps rather than collapsing them.
 */
export function bucketStartsBetween(
  startTime: number,
  endTime: number,
  bucketMs: number,
  tzOffsetMs: number,
): number[] {
  if (endTime <= startTime) return [];
  const first =
    Math.floor((startTime - tzOffsetMs) / bucketMs) * bucketMs + tzOffsetMs;
  const starts: number[] = [];
  for (let start = first; start < endTime; start += bucketMs) {
    starts.push(start);
  }
  return starts;
}

export interface UsageChartBucket {
  bucketStart: number;
  model: string;
  costUsd: number;
}

export interface UsageSeries {
  model: string;
  data: number[];
}

/**
 * One series per model over `starts`, spend-desc so the largest model sits at
 * the bottom of the stack. Buckets outside `starts` are ignored.
 */
export function buildUsageSeries(
  buckets: ReadonlyArray<UsageChartBucket>,
  starts: ReadonlyArray<number>,
): UsageSeries[] {
  const indexByStart = new Map(starts.map((start, index) => [start, index]));
  const byModel = new Map<string, { data: number[]; total: number }>();
  for (const bucket of buckets) {
    const index = indexByStart.get(bucket.bucketStart);
    if (index === undefined) continue;
    let series = byModel.get(bucket.model);
    if (!series) {
      series = {
        data: Array.from({ length: starts.length }, () => 0),
        total: 0,
      };
      byModel.set(bucket.model, series);
    }
    series.data[index] = (series.data[index] ?? 0) + bucket.costUsd;
    series.total += bucket.costUsd;
  }
  return Array.from(byModel.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([model, series]) => ({ model, data: series.data }));
}

/** Axis label for a bucket: clock hour for hourly buckets, day-month otherwise. */
export function formatBucketLabel(
  bucketStart: number,
  bucket: UsageBucketSize,
): string {
  return dayjs(bucketStart).format(bucket === "hour" ? "HH:mm" : "D MMM");
}

/** Share of `total` as a whole-number percentage, 0 when there is no total. */
export function sharePercent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
