import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { formatCost, formatTokens, sharePercent } from "../_utils";

interface UsageModelRow {
  model: string;
  provider?: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  completions: number;
  unpricedCompletions: number;
}

interface UsageModelTableProps {
  rows: ReadonlyArray<UsageModelRow>;
  totalCostUsd: number;
}

/** Per-model breakdown, spend-desc, with each model's share of period spend. */
export function UsageModelTable({ rows, totalCostUsd }: UsageModelTableProps) {
  return (
    <SettingsSection title="By model" bodyVariant="list">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 text-right font-medium">Spend</th>
              <th className="px-4 py-2 text-right font-medium">Share</th>
              <th className="px-4 py-2 text-right font-medium">Input</th>
              <th className="px-4 py-2 text-right font-medium">Output</th>
              <th className="px-4 py-2 text-right font-medium">Cache reads</th>
              <th className="px-4 py-2 text-right font-medium">Completions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row, index) => (
              <ListEnter
                key={row.model}
                as="tr"
                index={index}
                slide={false}
                className="tabular-nums"
              >
                <td className="px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-foreground">
                      {row.model}
                    </span>
                    {row.provider ? (
                      <span className="text-xs text-muted-foreground">
                        {row.provider}
                      </span>
                    ) : null}
                    {row.unpricedCompletions > 0 ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        unpriced
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {formatCost(row.costUsd)}
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {sharePercent(row.costUsd, totalCostUsd)}%
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {formatTokens(row.inputTokens)}
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {formatTokens(row.outputTokens)}
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {formatTokens(row.cacheReadTokens)}
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {row.completions.toLocaleString("en-GB")}
                </td>
              </ListEnter>
            ))}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
