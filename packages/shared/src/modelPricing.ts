/**
 * Published list prices per million tokens, used to estimate what prompt
 * caching saved on a completion. Provider result events already carry the
 * billed cost; this table only feeds the "cache savings" figure and the
 * "unpriced" flag on the Usage page.
 *
 * Every row cites where and when the rate was read. Models without a
 * published rate are deliberately absent — never guess a price.
 */
export interface ModelPricing {
  inputPerMillion: number;
  cacheReadPerMillion: number;
  /** 5-minute cache write rate where the provider publishes one. */
  cacheWritePerMillion?: number;
  outputPerMillion: number;
  /** URL the rates were read from. */
  source: string;
  /** Date the rates were read, YYYY-MM-DD. */
  asOf: string;
}

const ANTHROPIC_PRICING_URL =
  "https://platform.claude.com/docs/en/about-claude/pricing";
const ANTHROPIC_PRICING_AS_OF = "2026-09-01";

function anthropicRow(
  inputPerMillion: number,
  cacheReadPerMillion: number,
  cacheWritePerMillion: number,
  outputPerMillion: number,
): ModelPricing {
  return {
    inputPerMillion,
    cacheReadPerMillion,
    cacheWritePerMillion,
    outputPerMillion,
    source: ANTHROPIC_PRICING_URL,
    asOf: ANTHROPIC_PRICING_AS_OF,
  };
}

/**
 * Anthropic first-party API list prices (USD per MTok) from the "Model
 * pricing" table at ANTHROPIC_PRICING_URL, read on ANTHROPIC_PRICING_AS_OF.
 * Columns: base input, cache hit, 5m cache write, output. Keys are the
 * undated model ids; dated snapshots resolve by prefix (see
 * `resolveModelPricing`). Retired models are omitted.
 */
export const CLAUDE_PRICING_PER_MILLION: Record<string, ModelPricing> = {
  "claude-fable-5-1": anthropicRow(10, 0.25, 12.5, 50),
  "claude-mythos-5-1": anthropicRow(10, 0.25, 12.5, 50),
  "claude-fable-5": anthropicRow(10, 1, 12.5, 50),
  "claude-mythos-5": anthropicRow(10, 1, 12.5, 50),
  "claude-opus-5": anthropicRow(5, 0.5, 6.25, 25),
  "claude-opus-4-8": anthropicRow(5, 0.5, 6.25, 25),
  "claude-opus-4-7": anthropicRow(5, 0.5, 6.25, 25),
  "claude-opus-4-6": anthropicRow(5, 0.5, 6.25, 25),
  "claude-opus-4-5": anthropicRow(5, 0.5, 6.25, 25),
  "claude-sonnet-5": anthropicRow(2, 0.2, 2.5, 10),
  "claude-sonnet-4-6": anthropicRow(3, 0.3, 3.75, 15),
  "claude-sonnet-4-5": anthropicRow(3, 0.3, 3.75, 15),
  "claude-haiku-4-5": anthropicRow(1, 0.1, 1.25, 5),
};

/**
 * Moved verbatim from callback-src/config.ts; consumed by
 * `computeCodexCostUsd` in the sandbox callback bundle. The original comment
 * cited "OpenAI API list prices" without a URL or date, so these rows are
 * not wired into `resolveModelPricing` — Codex completions report as
 * unpriced for cache savings until the rates are re-verified against
 * https://developers.openai.com/api/docs/pricing.
 */
export const CODEX_PRICING_PER_MILLION: Record<
  string,
  { input: number; cached: number; output: number }
> = {
  // OpenAI API list prices (per 1M tokens).
  // GPT-6 Astra — third-party report of the OpenAI pricing page, read
  // 2026-09-11; verify against https://developers.openai.com/api/docs/pricing.
  "gpt-6-astra": { input: 10.0, cached: 1.0, output: 50.0 },
  "gpt-5.6-sol": { input: 5.0, cached: 0.5, output: 30.0 },
  "gpt-5.6-terra": { input: 2.0, cached: 0.2, output: 12.0 },
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, output: 1.2 },
  // Legacy — kept so in-flight sandboxes still cost-account correctly.
  "gpt-5.5": { input: 5.0, cached: 0.5, output: 30.0 },
  "gpt-5.5-pro": { input: 30.0, cached: 30.0, output: 180.0 },

  "gpt-5.4": { input: 1.25, cached: 0.125, output: 10.0 },
  "gpt-5.4-mini": { input: 0.25, cached: 0.025, output: 2.0 },
  "gpt-5.3-codex": { input: 1.25, cached: 0.125, output: 10.0 },
  "gpt-5.2-codex": { input: 1.25, cached: 0.125, output: 10.0 },
  "gpt-5-codex": { input: 1.25, cached: 0.125, output: 10.0 },
};

// Longest key first so "claude-fable-5-1" wins over "claude-fable-5" for
// "claude-fable-5-1-20260801" and the like.
const CLAUDE_KEYS_BY_LENGTH = Object.keys(CLAUDE_PRICING_PER_MILLION).sort(
  (a, b) => b.length - a.length,
);

const PROVIDER_PREFIXES = ["claude:", "anthropic/", "anthropic."];

/**
 * Canonical id for lookup: provider prefixes and the Claude Code `[1m]`
 * context suffix are dropped, case is normalised. Exported for tests and for
 * grouping display rows by the same key the pricing lookup uses.
 */
export function normaliseModelId(model: string): string {
  let id = model.trim().toLowerCase();
  for (const prefix of PROVIDER_PREFIXES) {
    if (id.startsWith(prefix)) {
      id = id.slice(prefix.length);
      break;
    }
  }
  return id.replace(/\[1m\]$/, "");
}

/**
 * Published pricing for a model id as it appears in a result event, or null
 * when no rate is on file. Dated ids (`claude-opus-4-5-20251101`) resolve to
 * their undated row by longest-prefix match; a prefix only counts when it is
 * followed by a `-` or the end of the id, so `claude-opus-4-5` never matches
 * `claude-opus-4-50`.
 */
export function resolveModelPricing(model: string): ModelPricing | null {
  const id = normaliseModelId(model);
  for (const key of CLAUDE_KEYS_BY_LENGTH) {
    if (id === key || id.startsWith(`${key}-`)) {
      return CLAUDE_PRICING_PER_MILLION[key] ?? null;
    }
  }
  return null;
}

/**
 * USD saved by serving `cacheReadTokens` from cache instead of as fresh
 * input: tokens × (input rate − cache read rate) / 1e6. Null when the model
 * is unpriced so callers can count it rather than silently add zero.
 */
export function computeCacheSavingsUsd(
  model: string,
  cacheReadTokens: number,
): number | null {
  const pricing = resolveModelPricing(model);
  if (!pricing) return null;
  if (!Number.isFinite(cacheReadTokens) || cacheReadTokens <= 0) return 0;
  return (
    (cacheReadTokens *
      (pricing.inputPerMillion - pricing.cacheReadPerMillion)) /
    1_000_000
  );
}
