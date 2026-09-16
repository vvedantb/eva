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

function ContextUsageDisplay({
  aggregated,
}: {
  aggregated: ReturnType<typeof aggregateUsage>;
}) {
  if (!aggregated) return null;

  const { maxTokens } = aggregated;
  // `Context` requires a numeric `maxTokens`, so an unknown window passes the
  // used tokens as the denominator and suppresses every percentage instead: a
  // hardcoded 200k denominator is what made this meter lie in the first place.
  return (
    <Context
      usedTokens={aggregated.usedTokens}
      maxTokens={maxTokens ?? aggregated.usedTokens}
      usage={aggregated.usage}
      costs={aggregated.costs}
    >
      {maxTokens === null ? (
        <ContextTrigger>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={UNKNOWN_WINDOW_TITLE}
          >
            <span className="font-medium text-muted-foreground text-xs tabular-nums">
              —
            </span>
          </Button>
        </ContextTrigger>
      ) : (
        <ContextTrigger />
      )}
      <ContextContent>
        {maxTokens === null ? (
          <ContextContentHeader>
            <div className="flex items-center justify-between gap-3 text-xs tabular-nums">
              <p title={UNKNOWN_WINDOW_TITLE}>—</p>
              <p className="font-mono text-muted-foreground">
                {new Intl.NumberFormat("en-US", {
                  notation: "compact",
                }).format(aggregated.usedTokens)}{" "}
                used
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
        <ContextContentFooter />
      </ContextContent>
    </Context>
  );
}

interface EntityContextUsageProps {
  repoId: Id<"githubRepos">;
  entityId: string;
}

export function EntityContextUsage({
  repoId,
  entityId,
}: EntityContextUsageProps) {
  const simpleView = useSimpleView();
  const logs = useQuery(
    api.logs.getByEntityId,
    simpleView ? "skip" : { repoId, entityId },
  );
  if (simpleView) return null;
  const aggregated = aggregateUsage(logs);
  return <ContextUsageDisplay aggregated={aggregated} />;
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
