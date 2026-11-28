import { contextWindowForRawModel } from "@eva/backend";
import { parseResultEvent } from "./resultEvent";

type AggregatableLog = { rawResultEvent: string | undefined };

/**
 * Context-window occupancy is the latest result, not the sum of every turn's
 * cache reads. Session 65 summed ~29M cache-read tokens against a 200k default
 * window and rendered 14,530.8%. Cost still sums across the session.
 */
export function aggregateUsage(logs: AggregatableLog[] | undefined) {
  if (!logs || logs.length === 0) return null;

  let totalCostUsd = 0;
  let latest: ReturnType<typeof parseResultEvent> | null = null;

  for (const log of logs) {
    const parsed = parseResultEvent(log.rawResultEvent);
    totalCostUsd += parsed.costUsd;
    if (latest === null && parsed.model !== "-") {
      latest = parsed;
    }
  }

  if (latest === null) {
    const first = logs[0];
    if (first === undefined) return null;
    latest = parseResultEvent(first.rawResultEvent);
  }

  const maxTokens =
    latest.contextWindow > 0
      ? latest.contextWindow
      : contextWindowForRawModel(latest.model);

  return {
    usedTokens: latest.contextUsedTokens,
    maxTokens,
    model: latest.model,
    usage: {
      inputTokens: latest.inputTokens,
      outputTokens: latest.outputTokens,
      cachedInputReadTokens: latest.cacheReadTokens,
      cachedInputWriteTokens: latest.cacheCreationTokens,
    },
    costs: {
      totalUSD: totalCostUsd,
    },
  };
}

/** t3 paints the donut red past 90% so a near-full window is obvious. */
export const CONTEXT_OVERLOAD_RATIO = 0.9;

export function contextUsedRatio(
  usedTokens: number,
  maxTokens: number | null,
): number {
  if (maxTokens === null || maxTokens <= 0) return 0;
  return usedTokens / maxTokens;
}

export function contextCompactsAutomatically(model: string): boolean {
  return model === "-" || model.includes("claude");
}

