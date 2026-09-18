"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@eva/ui";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  chipSummaryForActive,
  claudeUsageAccountScope,
  snapshotsOf,
  usageRowsForAccount,
  USAGE_TONE_TEXT_CLASS,
} from "./_utils";
import { useCountUpDisplay } from "@/lib/components/analytics/useCountUpDisplay";
import { UsageBar } from "./UsageBar";
import { UsageLimitsDetails } from "./UsageLimitsDetails";
import { useMinuteNow } from "./_useMinuteNow";

interface UsageLimitsIndicatorProps {
  repoId: Id<"githubRepos">;
  /** Active chat model — scopes the chip bar (e.g. Fable → Weekly Fable %). */
  model: string | null | undefined;
  /**
   * Sticky credential for this chat. `undefined` while still loading; `null` is
   * Team. Only affects the chip bar — the popover always lists every account.
   */
  providerAccountId: Id<"userProviderAccounts"> | null | undefined;
  accountLabel: string;
}

/**
 * The one plan-usage control for every chat surface.
 *
 * - Chip / bar: the active Claude account, preferring the selected model's
 *   weekly window when Anthropic reports one.
 * - Popover: every Claude credential the viewer can run on — same query
 *   everywhere, so switching sessions cannot show a different card of numbers.
 *
 * Simple view hides it with the context gauge.
 */
export function UsageLimitsIndicator({
  repoId,
  model,
  providerAccountId,
  accountLabel,
}: UsageLimitsIndicatorProps) {
  const simpleView = useSimpleView();
  const now = useMinuteNow();
  const entries = useQuery(
    api.usageLimits.getForViewer,
    simpleView ? "skip" : { repoId, now },
  );
  const accountScope =
    providerAccountId === undefined
      ? undefined
      : claudeUsageAccountScope(model, {
          providerAccountId,
          accountLabel,
        });
  const rows = snapshotsOf(entries ?? []);
  const chipRows = accountScope
    ? usageRowsForAccount(rows, accountScope)
    : rows;
  const summary =
    entries === undefined
      ? undefined
      : chipSummaryForActive(chipRows, now, model);
  const chipLabel = useCountUpDisplay(summary?.label ?? "—");

  if (simpleView) return null;
  if (entries === undefined) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Agent plan usage"
        >
          <span
            className={`font-medium text-xs tabular-nums ${USAGE_TONE_TEXT_CLASS[summary?.tone ?? "neutral"]}`}
          >
            {chipLabel}
          </span>
          {summary?.utilization !== undefined && (
            <UsageBar
              utilization={summary.utilization}
              tone={summary.tone}
              className="w-6 shrink-0"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 overflow-hidden p-0">
        <UsageLimitsDetails repoId={repoId} entries={entries} now={now} />
      </PopoverContent>
    </Popover>
  );
}
