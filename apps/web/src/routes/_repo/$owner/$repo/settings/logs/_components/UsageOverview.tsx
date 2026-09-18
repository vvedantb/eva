import {
  IconCoin,
  IconDatabase,
  IconPigMoney,
  IconArrowDownToArc,
  IconArrowUpFromArc,
  IconStack2,
} from "@tabler/icons-react";
import { Kpi, KpiGroup } from "@/lib/components/analytics/Kpi";
import { formatCost, formatTokens } from "../_utils";

interface UsageOverviewTotals {
  costUsd: number;
  cacheSavingsUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  completions: number;
  unpricedCompletions: number;
}

interface UsageOverviewProps {
  title: string;
  totals: UsageOverviewTotals;
  /** True when the backend hit its row cap and the numbers are a floor. */
  truncated: boolean;
}

/**
 * Period headline for the Usage overview: spend first, then the token and
 * cache figures that explain it. Cache savings is what the cache-read tokens
 * would have cost at the model's input rate minus what they did cost — it is
 * only summed for models with a published rate, hence the unpriced footnote.
 */
export function UsageOverview({
  title,
  totals,
  truncated,
}: UsageOverviewProps) {
  const notes: string[] = [];
  if (totals.unpricedCompletions > 0) {
    notes.push(
      `${totals.unpricedCompletions} of ${totals.completions} completions have no published rate and add nothing to cache savings.`,
    );
  }
  if (truncated) {
    notes.push("Only the most recent 5,000 completions are counted.");
  }

  return (
    <section className="flex flex-col gap-3 px-4">
      <h3 className="text-balance text-sm font-semibold text-foreground">
        {title}
      </h3>
      <KpiGroup className="lg:grid-cols-3">
        <Kpi
          icon={IconCoin}
          label="Spend"
          value={formatCost(totals.costUsd)}
          subtitle="API-equivalent cost in USD"
          size="lg"
        />
        <Kpi
          icon={IconPigMoney}
          label="Cache savings"
          value={formatCost(totals.cacheSavingsUsd)}
          subtitle="Versus paying the input rate on cache reads"
        />
        <Kpi
          icon={IconStack2}
          label="Completions"
          value={totals.completions.toLocaleString("en-GB")}
        />
        <Kpi
          icon={IconArrowDownToArc}
          label="Input tokens"
          value={formatTokens(totals.inputTokens)}
        />
        <Kpi
          icon={IconArrowUpFromArc}
          label="Output tokens"
          value={formatTokens(totals.outputTokens)}
        />
        <Kpi
          icon={IconDatabase}
          label="Cache reads"
          value={formatTokens(totals.cacheReadTokens)}
        />
      </KpiGroup>
      {notes.length > 0 ? (
        <p className="text-xs text-pretty text-muted-foreground">
          {notes.join(" ")}
        </p>
      ) : null}
    </section>
  );
}
