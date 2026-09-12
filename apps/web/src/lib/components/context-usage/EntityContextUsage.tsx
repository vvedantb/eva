"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextContentFooter,
  ContextInputUsage,
  ContextOutputUsage,
  ContextCacheReadUsage,
  ContextCacheWriteUsage,
} from "@eva/ui";
import { parseResultEvent } from "@/lib/utils/logs";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

// Model context window sizes (in tokens). Used for the usage percentage display;
// not for cost (cost comes from Claude's `total_cost_usd` in the result event).
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "claude-opus-5": 1000000,
  "claude-sonnet-4-20250514": 200000,
  "claude-3-5-sonnet-20241022": 200000,
  "claude-3-5-haiku-20241022": 200000,
  "claude-3-opus-20240229": 200000,
  "claude-3-sonnet-20240229": 200000,
  "claude-3-haiku-20240307": 200000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "gpt-3.5-turbo": 16385,
};

function getMaxTokens(model: string): number {
  return MODEL_CONTEXT_WINDOWS[model] ?? 200000;
}

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
      : getMaxTokens(latest.model);

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
  maxTokens: number,
): number {
  if (maxTokens <= 0) return 0;
  return usedTokens / maxTokens;
}

export function contextCompactsAutomatically(model: string): boolean {
  return model === "-" || model.includes("claude");
}

export function ContextUsageDisplay({
  aggregated,
  defaultOpen = false,
  onCompact,
}: {
  aggregated: ReturnType<typeof aggregateUsage>;
  defaultOpen?: boolean;
  onCompact?: () => void;
}) {
  if (!aggregated) return null;
  const usedRatio = contextUsedRatio(
    aggregated.usedTokens,
    aggregated.maxTokens,
  );
  const overloaded = usedRatio > CONTEXT_OVERLOAD_RATIO;
  const remaining = Math.max(0, aggregated.maxTokens - aggregated.usedTokens);
  const remainingLabel = new Intl.NumberFormat("en-US", {
    notation: "compact",
  }).format(remaining);
  const autoCompact = contextCompactsAutomatically(aggregated.model);

  return (
    <Context
      {...(defaultOpen ? { open: true } : {})}
      usedTokens={aggregated.usedTokens}
      maxTokens={aggregated.maxTokens}
      usage={aggregated.usage}
      costs={aggregated.costs}
    >
      <ContextTrigger
        data-testid="context-meter"
        className={overloaded ? "text-destructive" : undefined}
      />
      <ContextContent data-testid="context-meter-popover">
        <ContextContentHeader />
        <ContextContentBody className="space-y-1">
          <ContextInputUsage />
          <ContextOutputUsage />
          <ContextCacheReadUsage />
          <ContextCacheWriteUsage />
        </ContextContentBody>
        <div className="space-y-2 px-3 pb-3 text-[11px] leading-4 text-muted-foreground">
          <p>
            {remainingLabel} tokens left
            {overloaded ? " · window is nearly full" : ""}
          </p>
          {autoCompact ? (
            <p>Context compacts automatically when needed.</p>
          ) : null}
          {onCompact ? (
            <button
              type="button"
              data-testid="context-meter-compact"
              className="inline-flex h-7 w-full items-center justify-center rounded-md border border-border bg-background text-xs text-foreground hover:bg-muted"
              onClick={onCompact}
            >
              Compact
            </button>
          ) : null}
        </div>
        <ContextContentFooter />
      </ContextContent>
    </Context>
  );
}

interface EntityContextUsageProps {
  repoId: Id<"githubRepos">;
  entityId: string;
  /** Demo / screenshot seed — skips the logs query. */
  seedAggregated?: NonNullable<ReturnType<typeof aggregateUsage>>;
  defaultOpen?: boolean;
  onCompact?: () => void;
}

export function EntityContextUsage({
  repoId,
  entityId,
  seedAggregated,
  defaultOpen,
  onCompact,
}: EntityContextUsageProps) {
  const simpleView = useSimpleView();
  const logs = useQuery(
    api.logs.getByEntityId,
    simpleView || seedAggregated ? "skip" : { repoId, entityId },
  );
  if (simpleView) return null;
  const aggregated = seedAggregated ?? aggregateUsage(logs);
  return (
    <ContextUsageDisplay
      aggregated={aggregated}
      defaultOpen={defaultOpen}
      onCompact={onCompact}
    />
  );
}

interface ProjectContextUsageProps {
  repoId: Id<"githubRepos">;
  projectId: Id<"projects">;
}

// Aggregates usage across every log tagged with the projectId — project chats,
// project tasks, interviews — so the project header reflects total spend.
export function ProjectContextUsage({
  repoId,
  projectId,
}: ProjectContextUsageProps) {
  const simpleView = useSimpleView();
  const logs = useQuery(
    api.logs.getByProjectId,
    simpleView ? "skip" : { repoId, projectId },
  );
  if (simpleView) return null;
  const aggregated = aggregateUsage(logs);
  return <ContextUsageDisplay aggregated={aggregated} />;
}
