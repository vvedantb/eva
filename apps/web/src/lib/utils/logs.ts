export { parseResultEvent, getTotalInputTokens } from "@eva/shared/resultEvent";

const usdWhole = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Sub-cent completions (a Haiku call, a title regeneration) would all render
// as "$0.00"; give them enough precision to be distinguishable.
const usdSubCent = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 3,
  maximumFractionDigits: 4,
});

/** Formats a USD amount — costs are stored and shown in USD, the billing currency. */
export function formatCost(costUsd: number): string {
  if (!Number.isFinite(costUsd)) return usdWhole.format(0);
  const abs = Math.abs(costUsd);
  if (abs > 0 && abs < 0.01) return usdSubCent.format(costUsd);
  return usdWhole.format(costUsd);
}

export function formatTokens(count: number): string {
  if (count === 0) return "0";
  if (count >= 1e12) return `${(count / 1e12).toFixed(1)}T`;
  if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`;
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
  if (count >= 1e3) return `${(count / 1e3).toFixed(1)}k`;
  return String(count);
}
