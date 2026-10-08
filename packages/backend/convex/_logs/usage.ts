import type { Infer } from "convex/values";
import { v } from "convex/values";
import { tryParseResultEvent } from "@eva/shared/resultEvent";
import { logUsageFields } from "../_validators/tableFields";

const logUsageValidator = v.object(logUsageFields);
export type LogUsage = Infer<typeof logUsageValidator>;

/**
 * Denormalised usage columns for a logs row, read once from the provider's
 * result event at insert time so aggregate queries never parse JSON. Returns
 * `{}` when the event is absent or unparseable — the columns stay undefined
 * and the row counts as unpriced rather than as a zero-cost completion.
 */
export function deriveLogUsage(rawResultEvent: string | undefined): LogUsage {
  const parsed = tryParseResultEvent(rawResultEvent);
  if (!parsed) return {};
  return {
    costUsd: parsed.costUsd,
    // "-" is the parser's no-model sentinel; leave the column unset instead.
    model: parsed.model === "-" ? undefined : parsed.model,
    provider: parsed.provider || undefined,
    inputTokens: parsed.inputTokens,
    outputTokens: parsed.outputTokens,
    cacheReadTokens: parsed.cacheReadTokens,
    cacheCreationTokens: parsed.cacheCreationTokens,
    durationMs: parsed.durationMs,
    contextWindow: parsed.contextWindow || undefined,
  };
}
