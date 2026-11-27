"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import {
  aggregateUsage,
  CONTEXT_OVERLOAD_RATIO,
  contextCompactsAutomatically,
  contextUsedRatio,
} from "@eva/shared/contextUsage";
import type { Id } from "@eva/backend";
import {
  Button,
  ContextUsage,
  ContextUsageTrigger,
  ContextUsageContent,
  ContextUsageContentHeader,
  ContextUsageContentBody,
  ContextUsageContentFooter,
} from "@vvedantb/ui";
import {
  ContextCostFooter,
  ContextMeterButton,
  ContextMeterHeader,
  ContextUsageRows,
} from "@/lib/components/context-usage/RollingContextParts";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

const UNKNOWN_WINDOW_TITLE = "Context window unknown for this model";

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact" });
const compactFormat = (value: number) => compactNumber.format(value);

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
  const remainingLabel =
    maxTokens === null
      ? null
      : compactFormat(Math.max(0, maxTokens - aggregated.usedTokens));
  const autoCompact = contextCompactsAutomatically(aggregated.model);

  // `ContextUsage` requires a numeric `maxTokens`, so an unknown window passes the
  // used tokens as the denominator and suppresses every percentage instead: a
  // hardcoded 200k denominator is what made this meter lie in the first place.
  return (
    <ContextUsage
      {...(defaultOpen ? { open: true } : {})}
      usedTokens={aggregated.usedTokens}
      maxTokens={maxTokens ?? aggregated.usedTokens}
      usage={aggregated.usage}
      costs={aggregated.costs}
    >
      {maxTokens === null ? (
        // `ContextUsageTrigger` only forwards props to its own fallback Button, so
        // the test id has to ride on the Button we hand it as children.
        <ContextUsageTrigger>
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
        </ContextUsageTrigger>
      ) : (
        <ContextUsageTrigger>
          <ContextMeterButton
            ratio={contextUsedRatio(aggregated.usedTokens, maxTokens)}
            className={overloaded ? "text-destructive" : undefined}
          />
        </ContextUsageTrigger>
      )}
      <ContextUsageContent data-testid="context-meter-popover">
        {maxTokens === null ? (
          <ContextUsageContentHeader>
            <div className="flex items-center justify-between gap-3 text-xs tabular-nums">
              <p title={UNKNOWN_WINDOW_TITLE}>—</p>
              <p className="font-mono text-muted-foreground">
                {compactFormat(aggregated.usedTokens)} used
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {UNKNOWN_WINDOW_TITLE}
            </p>
          </ContextUsageContentHeader>
        ) : (
          <ContextUsageContentHeader>
            <ContextMeterHeader
              usedTokens={aggregated.usedTokens}
              maxTokens={maxTokens}
            />
          </ContextUsageContentHeader>
        )}
        <ContextUsageContentBody className="space-y-1">
          <ContextUsageRows usage={aggregated.usage} />
        </ContextUsageContentBody>
        <div className="space-y-2 px-3 pb-3 text-2xs leading-4 text-muted-foreground">
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
        <ContextUsageContentFooter>
          <ContextCostFooter totalUSD={aggregated.costs.totalUSD} />
        </ContextUsageContentFooter>
      </ContextUsageContent>
    </ContextUsage>
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
