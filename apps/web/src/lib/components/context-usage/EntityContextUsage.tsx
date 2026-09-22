"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, contextWindowForRawModel } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Button,
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

const UNKNOWN_WINDOW_TITLE = "Context window unknown for this model";

/** One formatter for every compact token figure rendered below. */
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact" });
const compactFormat = (value: number) => compactNumber.format(value);

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

  // The run's own reported window wins (it accounts for traits like Claude's 1M
  // mode); otherwise fall back to the catalogue, which returns null rather than
  // a guess when it does not recognise the model.
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
  const { maxTokens } = aggregated;
  const overloaded =
    contextUsedRatio(aggregated.usedTokens, maxTokens) > CONTEXT_OVERLOAD_RATIO;
  // Only a known window has a meaningful "left" figure.
  const remainingLabel =
    maxTokens === null
      ? null
      : compactFormat(Math.max(0, maxTokens - aggregated.usedTokens));
  const autoCompact = contextCompactsAutomatically(aggregated.model);

  // `Context` requires a numeric `maxTokens`, so an unknown window passes the
  // used tokens as the denominator and suppresses every percentage instead: a
  // hardcoded 200k denominator is what made this meter lie in the first place.
  return (
    <Context
      {...(defaultOpen ? { open: true } : {})}
      usedTokens={aggregated.usedTokens}
      maxTokens={maxTokens ?? aggregated.usedTokens}
      usage={aggregated.usage}
      costs={aggregated.costs}
    >
      {maxTokens === null ? (
        // `ContextTrigger` only forwards props to its own fallback Button, so
        // the test id has to ride on the Button we hand it as children.
        <ContextTrigger>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="context-meter"
            title={UNKNOWN_WINDOW_TITLE}
          >
            <span className="font-medium text-muted-foreground text-xs tabular-nums">
              —
            </span>
          </Button>
        </ContextTrigger>
      ) : (
        <ContextTrigger
          data-testid="context-meter"
          className={overloaded ? "text-destructive" : undefined}
        />
      )}
      <ContextContent data-testid="context-meter-popover">
        {maxTokens === null ? (
          <ContextContentHeader>
            <div className="flex items-center justify-between gap-3 text-xs tabular-nums">
              <p title={UNKNOWN_WINDOW_TITLE}>—</p>
              <p className="font-mono text-muted-foreground">
                {compactFormat(aggregated.usedTokens)} used
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {UNKNOWN_WINDOW_TITLE}
            </p>
          </ContextContentHeader>
        ) : (
          <ContextContentHeader />
        )}
        <ContextContentBody className="space-y-1">
          <ContextInputUsage />
          <ContextOutputUsage />
          <ContextCacheReadUsage />
          <ContextCacheWriteUsage />
        </ContextContentBody>
        <div className="space-y-2 px-3 pb-3 text-[11px] leading-4 text-muted-foreground">
          {remainingLabel === null ? null : (
            <p>
              {remainingLabel} tokens left
              {overloaded ? " · window is nearly full" : ""}
            </p>
          )}
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
