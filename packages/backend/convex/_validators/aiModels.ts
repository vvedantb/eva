import { v } from "convex/values";

function tuple<const Values extends readonly [string, ...string[]]>(
  ...values: Values
): Values {
  return values;
}

/** Canonical provider list for types, Convex validators, and Zod boundaries. */
export const AI_PROVIDERS = tuple("claude", "codex", "opencode", "cursor");
export type AIProvider = (typeof AI_PROVIDERS)[number];

export const aiProviderValidator = v.union(
  ...AI_PROVIDERS.map((provider) => v.literal(provider)),
);

export const aiModelValidator = v.union(
  v.literal("opus"),
  v.literal("sonnet"),
  v.literal("haiku"),
  v.literal("claude:opus"),
  v.literal("claude:sonnet"),
  v.literal("claude:haiku"),
  v.literal("claude:opusplan"),
  v.literal("claude:claude-opus-4-5-20251101"),
  v.literal("claude:claude-opus-4-6"),
  v.literal("claude:claude-fable-5-1"),
  // Legacy Fable 5 — still accepted so existing sessions can load;
  // normalizeAIModel maps it to claude-fable-5-1.
  v.literal("claude:claude-fable-5"),
  v.literal("codex:gpt-6-astra"),
  v.literal("codex:gpt-5.6-sol"),
  v.literal("codex:gpt-5.6-terra"),
  v.literal("codex:gpt-5.6-luna"),
  // Legacy Codex — still accepted so existing sessions can load;
  // normalizeAIModel maps them to gpt-5.6-sol (the bare 5.6 alias included).
  v.literal("codex:gpt-5.6"),
  v.literal("codex:gpt-5.5"),
  v.literal("codex:gpt-5.5-pro"),
  v.literal("codex:gpt-5.4"),
  v.literal("codex:gpt-5.4-mini"),
  v.literal("codex:gpt-5.3-codex"),
  v.literal("codex:gpt-5.2-codex"),
  v.literal("opencode:openai/gpt-6-astra"),
  v.literal("opencode:openai/gpt-5.6-sol"),
  v.literal("opencode:openai/gpt-5.6-terra"),
  v.literal("opencode:openai/gpt-5.6-luna"),
  // Legacy opencode — still accepted so existing sessions can load;
  // normalizeAIModel maps them to openai/gpt-5.6-sol.
  v.literal("opencode:openai/gpt-5-codex"),
  v.literal("opencode:openai/gpt-5.2"),
  v.literal("opencode:openai/gpt-5.3-codex"),
  v.literal("opencode:openai/gpt-5.4"),
  v.literal("opencode:openai/gpt-5.4-mini"),
  v.literal("cursor:grok-4.6"),
  v.literal("cursor:grok-4.5"),
  v.literal("cursor:gpt-6-astra"),
  v.literal("cursor:gemini-3.1-pro"),
  v.literal("cursor:composer-2.5"),
  // Legacy — still accepted so existing sessions with these lastModel values
  // can load; normalizeAIModel remaps them. The reasoning-suffixed cursor ids
  // predate the SDK migration (effort now lives on the traits menu).
  v.literal("cursor:grok-4.6-low"),
  v.literal("cursor:grok-4.6-medium"),
  v.literal("cursor:grok-4.6-high"),
  v.literal("cursor:grok-4.6-xhigh"),
  v.literal("cursor:grok-4.5-low"),
  v.literal("cursor:grok-4.5-medium"),
  v.literal("cursor:grok-4.5-high"),
  v.literal("cursor:gpt-5.5"),
  v.literal("cursor:gpt-5.5-low"),
  v.literal("cursor:gpt-5.5-high"),
  v.literal("cursor:composer-2"),
);

/**
 * Abstract, provider-neutral reasoning effort levels for the traits menu.
 * Threaded to the sandbox as `AI_REASONING_EFFORT` only when the user picks a
 * non-default level; mapped per provider in `callback-src/config.ts` (Claude
 * `--effort`, Codex `model_reasoning_effort`).
 */
export const REASONING_LEVELS = [
  "off",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export const reasoningLevelValidator = v.union(
  v.literal("off"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("xhigh"),
  v.literal("max"),
);

/** Optional trait overrides threaded from composer → queue → sandbox runner. */
export const modelTraitsExecutionFields = {
  reasoningLevel: v.optional(reasoningLevelValidator),
  thinkingEnabled: v.optional(v.boolean()),
  use1mContext: v.optional(v.boolean()),
  fastMode: v.optional(v.boolean()),
};

export const DEFAULT_REASONING_LEVEL: ReasoningLevel = "medium";

export interface ModelReasoningTraits {
  levels: ReadonlyArray<ReasoningLevel>;
  default: ReasoningLevel;
  ultrathink?: boolean;
}

export interface ModelTraits {
  reasoning?: ModelReasoningTraits;
  thinkingToggle?: boolean;
  contextWindow1m?: boolean;
  contextWindowDefaultLabel?: string;
  fastMode?: boolean;
}

export interface StoredModelTraits {
  effortLevel?: ReasoningLevel;
  thinkingEnabled?: boolean;
  use1mContext?: boolean;
  fastMode?: boolean;
}

export interface ModelTraitsExecutionArgs {
  reasoningLevel?: ReasoningLevel;
  thinkingEnabled?: boolean;
  use1mContext?: boolean;
  fastMode?: boolean;
}

const CLAUDE_REASONING_FULL: ModelReasoningTraits = {
  levels: ["low", "medium", "high", "xhigh", "max"],
  default: "high",
  ultrathink: true,
};

const CLAUDE_REASONING_NO_XHIGH: ModelReasoningTraits = {
  levels: ["low", "medium", "high", "max"],
  default: "high",
};

const CLAUDE_REASONING_OPUS_46: ModelReasoningTraits = {
  levels: ["low", "medium", "high", "max"],
  default: "high",
  ultrathink: true,
};

/** GPT-6 Astra: no none/minimal level; low is the floor. */
const CODEX_REASONING_ASTRA: ModelReasoningTraits = {
  levels: ["low", "medium", "high", "xhigh", "max"],
  default: "medium",
};

/** GPT-5.6 Sol/Terra/Luna: none/off through `max` above xhigh. */
const CODEX_REASONING_56: ModelReasoningTraits = {
  levels: ["off", "low", "medium", "high", "xhigh", "max"],
  default: "medium",
};

/**
 * Cursor SDK models: the level is resolved to a per-model SDK parameter at
 * runtime (resolveCursorModelSelection in callback-src) and degrades to the
 * bare model when the model exposes no reasoning parameter.
 */
const CURSOR_REASONING: ModelReasoningTraits = {
  levels: ["low", "medium", "high"],
  default: "medium",
};

/** Grok 4.6: low, medium, high (default), xhigh. Fast is a separate trait. */
const CURSOR_REASONING_GROK46: ModelReasoningTraits = {
  levels: ["low", "medium", "high", "xhigh"],
  default: "high",
};

/** GPT-6 Astra on Cursor: no `max` (config.ts clamps max → high). */
const CURSOR_REASONING_ASTRA: ModelReasoningTraits = {
  levels: ["low", "medium", "high", "xhigh"],
  default: "medium",
};

export type LegacyClaudeModel = "opus" | "sonnet" | "haiku";
export type AIModel =
  | "claude:opus"
  | "claude:sonnet"
  | "claude:haiku"
  | "claude:opusplan"
  | "claude:claude-opus-4-5-20251101"
  | "claude:claude-opus-4-6"
  | "claude:claude-fable-5-1"
  | "codex:gpt-6-astra"
  | "codex:gpt-5.6-sol"
  | "codex:gpt-5.6-terra"
  | "codex:gpt-5.6-luna"
  | "opencode:openai/gpt-6-astra"
  | "opencode:openai/gpt-5.6-sol"
  | "opencode:openai/gpt-5.6-terra"
  | "opencode:openai/gpt-5.6-luna"
  | "cursor:grok-4.6"
  | "cursor:grok-4.5"
  | "cursor:gpt-6-astra"
  | "cursor:gemini-3.1-pro"
  | "cursor:composer-2.5";
export type PersistedAIModel =
  | AIModel
  | LegacyClaudeModel
  | "claude:claude-fable-5"
  | "codex:gpt-5.6"
  | "codex:gpt-5.5"
  | "codex:gpt-5.5-pro"
  | "codex:gpt-5.4"
  | "codex:gpt-5.4-mini"
  | "codex:gpt-5.3-codex"
  | "codex:gpt-5.2-codex"
  | "opencode:openai/gpt-5-codex"
  | "opencode:openai/gpt-5.2"
  | "opencode:openai/gpt-5.3-codex"
  | "opencode:openai/gpt-5.4"
  | "opencode:openai/gpt-5.4-mini"
  | "cursor:grok-4.6-low"
  | "cursor:grok-4.6-medium"
  | "cursor:grok-4.6-high"
  | "cursor:grok-4.6-xhigh"
  | "cursor:grok-4.5-low"
  | "cursor:grok-4.5-medium"
  | "cursor:grok-4.5-high"
  | "cursor:gpt-5.5"
  | "cursor:gpt-5.5-low"
  | "cursor:gpt-5.5-high"
  | "cursor:composer-2";

export interface AIModelOption {
  id: AIModel;
  provider: AIProvider;
  label: string;
  requiresAuth: boolean;
  reasoning?: ModelReasoningTraits;
  thinkingToggle?: boolean;
  contextWindow1m?: boolean;
  contextWindowDefaultLabel?: string;
  fastMode?: boolean;
}

export interface AIProviderAvailability {
  claude: boolean;
  codex: boolean;
  opencode: boolean;
  cursor: boolean;
}

export const DEFAULT_AI_MODEL: AIModel = "claude:sonnet";

export const AI_MODEL_OPTIONS: ReadonlyArray<AIModelOption> = [
  {
    id: "claude:claude-fable-5-1",
    provider: "claude",
    label: "Fable 5.1",
    requiresAuth: true,
    reasoning: CLAUDE_REASONING_FULL,
    contextWindow1m: true,
  },
  {
    id: "claude:opus",
    provider: "claude",
    label: "Opus",
    requiresAuth: true,
    reasoning: CLAUDE_REASONING_FULL,
  },
  {
    id: "claude:sonnet",
    provider: "claude",
    label: "Sonnet",
    requiresAuth: true,
    reasoning: CLAUDE_REASONING_FULL,
    contextWindow1m: true,
  },
  {
    id: "claude:haiku",
    provider: "claude",
    label: "Haiku",
    requiresAuth: true,
    thinkingToggle: true,
  },
  {
    id: "claude:opusplan",
    provider: "claude",
    label: "Opus Plan",
    requiresAuth: true,
    reasoning: CLAUDE_REASONING_FULL,
  },
  {
    id: "claude:claude-opus-4-5-20251101",
    provider: "claude",
    label: "Opus 4.5",
    requiresAuth: true,
    reasoning: CLAUDE_REASONING_NO_XHIGH,
  },
  {
    id: "claude:claude-opus-4-6",
    provider: "claude",
    label: "Opus 4.6",
    requiresAuth: true,
    reasoning: CLAUDE_REASONING_OPUS_46,
    contextWindow1m: true,
  },
  {
    id: "codex:gpt-6-astra",
    provider: "codex",
    label: "GPT-6 Astra",
    requiresAuth: true,
    reasoning: CODEX_REASONING_ASTRA,
    fastMode: true,
  },
  {
    id: "codex:gpt-5.6-sol",
    provider: "codex",
    label: "GPT-5.6 Sol",
    requiresAuth: true,
    reasoning: CODEX_REASONING_56,
    fastMode: true,
  },
  {
    id: "codex:gpt-5.6-terra",
    provider: "codex",
    label: "GPT-5.6 Terra",
    requiresAuth: true,
    reasoning: CODEX_REASONING_56,
    fastMode: true,
  },
  {
    id: "codex:gpt-5.6-luna",
    provider: "codex",
    label: "GPT-5.6 Luna",
    requiresAuth: true,
    reasoning: CODEX_REASONING_56,
    fastMode: true,
  },
  {
    id: "opencode:openai/gpt-6-astra",
    provider: "opencode",
    label: "GPT-6 Astra",
    requiresAuth: true,
  },
  {
    id: "opencode:openai/gpt-5.6-sol",
    provider: "opencode",
    label: "GPT-5.6 Sol",
    requiresAuth: true,
  },
  {
    id: "opencode:openai/gpt-5.6-terra",
    provider: "opencode",
    label: "GPT-5.6 Terra",
    requiresAuth: true,
  },
  {
    id: "opencode:openai/gpt-5.6-luna",
    provider: "opencode",
    label: "GPT-5.6 Luna",
    requiresAuth: true,
  },
  {
    id: "cursor:grok-4.6",
    provider: "cursor",
    label: "Grok 4.6",
    requiresAuth: true,
    reasoning: CURSOR_REASONING_GROK46,
    fastMode: true,
  },
  {
    id: "cursor:grok-4.5",
    provider: "cursor",
    label: "Grok 4.5",
    requiresAuth: true,
    reasoning: CURSOR_REASONING,
    fastMode: true,
  },
  {
    id: "cursor:gpt-6-astra",
    provider: "cursor",
    label: "GPT-6 Astra",
    requiresAuth: true,
    reasoning: CURSOR_REASONING_ASTRA,
    contextWindow1m: true,
    contextWindowDefaultLabel: "272K",
  },
  {
    id: "cursor:gemini-3.1-pro",
    provider: "cursor",
    label: "Gemini 3.1 Pro",
    requiresAuth: true,
  },
  {
    id: "cursor:composer-2.5",
    provider: "cursor",
    label: "Composer 2.5",
    requiresAuth: true,
    fastMode: true,
  },
];

export const CLAUDE_MODELS: ReadonlyArray<AIModel> = AI_MODEL_OPTIONS.filter(
  (option) => option.provider === "claude",
).map((option) => option.id);
export const CODEX_MODELS: ReadonlyArray<AIModel> = AI_MODEL_OPTIONS.filter(
  (option) => option.provider === "codex",
).map((option) => option.id);
export const OPENCODE_MODELS: ReadonlyArray<AIModel> = AI_MODEL_OPTIONS.filter(
  (option) => option.provider === "opencode",
).map((option) => option.id);
export const CURSOR_MODELS: ReadonlyArray<AIModel> = AI_MODEL_OPTIONS.filter(
  (option) => option.provider === "cursor",
).map((option) => option.id);

export const CODEX_AUTH_ENV_KEYS: ReadonlyArray<string> = [
  "CODEX_AUTH_JSON",
  "CODEX_AUTH_JSON_BASE64",
];
export const CODEX_CONFIG_ENV_KEYS: ReadonlyArray<string> = [
  "CODEX_CONFIG_TOML",
  "CODEX_CONFIG_TOML_BASE64",
];
export const OPENCODE_AUTH_ENV_KEYS: ReadonlyArray<string> = [
  "OPENCODE_CONFIG_JSON",
  "OPENCODE_CONFIG_JSON_BASE64",
  "OPENCODE_AUTH_JSON",
  "OPENCODE_AUTH_JSON_BASE64",
];
export const CURSOR_AUTH_ENV_KEYS: ReadonlyArray<string> = ["CURSOR_API_KEY"];

/**
 * The canonical auth env-var key per provider. Used to mark a provider
 * "available" when a user has their own account for it, and as the primary
 * credential field in the Accounts UI.
 */
export const PROVIDER_PRIMARY_AUTH_KEY: Record<AIProvider, string> = {
  claude: "CLAUDE_CODE_OAUTH_TOKEN",
  codex: "CODEX_AUTH_JSON",
  opencode: "OPENCODE_AUTH_JSON",
  cursor: "CURSOR_API_KEY",
};

/** Determines which AI providers are available based on the presence of required env var keys. */
export function getAIProviderAvailability(
  envVarKeys: Iterable<string>,
): AIProviderAvailability {
  const keys = envVarKeys instanceof Set ? envVarKeys : new Set(envVarKeys);
  return {
    claude: keys.has("CLAUDE_CODE_OAUTH_TOKEN"),
    codex: CODEX_AUTH_ENV_KEYS.some((key) => keys.has(key)),
    opencode: OPENCODE_AUTH_ENV_KEYS.some((key) => keys.has(key)),
    cursor: CURSOR_AUTH_ENV_KEYS.some((key) => keys.has(key)),
  };
}

/** Normalizes a raw model string (including legacy formats) to a canonical AIModel value. */
export function normalizeAIModel(model: string | null | undefined): AIModel {
  switch (model) {
    case "opus":
    case "claude:opus":
      return "claude:opus";
    case "haiku":
    case "claude:haiku":
      return "claude:haiku";
    case "opusplan":
    case "claude:opusplan":
      return "claude:opusplan";
    case "claude-opus-4-5-20251101":
    case "claude:claude-opus-4-5-20251101":
      return "claude:claude-opus-4-5-20251101";
    case "claude-opus-4-6":
    case "claude:claude-opus-4-6":
      return "claude:claude-opus-4-6";
    case "fable":
    case "claude:fable":
    case "claude-fable-5":
    case "claude:claude-fable-5":
    case "claude-fable-5-1":
    case "claude:claude-fable-5-1":
      return "claude:claude-fable-5-1";
    case "codex:gpt-6-astra":
      return "codex:gpt-6-astra";
    case "codex:gpt-5.6-sol":
      return "codex:gpt-5.6-sol";
    case "codex:gpt-5.6-terra":
      return "codex:gpt-5.6-terra";
    case "codex:gpt-5.6-luna":
      return "codex:gpt-5.6-luna";
    // Bare gpt-5.6 alias routes to Sol (OpenAI's flagship alias), and retired
    // Codex generations collapse onto the current flagship.
    case "codex:gpt-5.6":
    case "codex:gpt-5.5":
    case "codex:gpt-5.5-pro":
    case "codex:gpt-5.4":
    case "codex:gpt-5.4-mini":
    case "codex:gpt-5.3-codex":
    case "codex:gpt-5.2-codex":
      return "codex:gpt-5.6-sol";
    case "opencode:openai/gpt-6-astra":
      return "opencode:openai/gpt-6-astra";
    case "opencode:openai/gpt-5.6-sol":
      return "opencode:openai/gpt-5.6-sol";
    case "opencode:openai/gpt-5.6-terra":
      return "opencode:openai/gpt-5.6-terra";
    case "opencode:openai/gpt-5.6-luna":
      return "opencode:openai/gpt-5.6-luna";
    // Retired opencode models collapse onto the current flagship.
    case "opencode:openai/gpt-5-codex":
    case "opencode:openai/gpt-5.2":
    case "opencode:openai/gpt-5.3-codex":
    case "opencode:openai/gpt-5.4":
    case "opencode:openai/gpt-5.4-mini":
      return "opencode:openai/gpt-5.6-sol";
    // Effort lives on the reasoning selector now — suffixed variants collapse
    // to one base model (the stored reasoning level carries the distinction).
    case "cursor:claude-4.6-sonnet-medium-thinking":
    case "cursor:claude-opus-4-7-thinking-high":
    case "cursor:claude-4.6-opus-high-thinking":
    case "cursor:claude-4.5-opus-high-thinking":
    case "cursor:gpt-5.4-high":
    case "cursor:grok-4.5":
    case "cursor:grok-4.5-low":
    case "cursor:grok-4.5-medium":
    case "cursor:grok-4.5-high":
      return "cursor:grok-4.5";
    case "cursor:grok-4.6":
    case "cursor:grok-4.6-low":
    case "cursor:grok-4.6-medium":
    case "cursor:grok-4.6-high":
    case "cursor:grok-4.6-xhigh":
      return "cursor:grok-4.6";
    case "cursor:gpt-5.3-codex-high":
      return "cursor:composer-2.5";
    case "cursor:gpt-6-astra":
    case "cursor:gpt-5.5":
    case "cursor:gpt-5.5-high":
    case "cursor:gpt-5.5-low":
      return "cursor:gpt-6-astra";
    case "cursor:gemini-3.1-pro":
      return "cursor:gemini-3.1-pro";
    case "cursor:composer-2":
    case "cursor:composer-2.5":
      return "cursor:composer-2.5";
    case "sonnet":
    case "claude:sonnet":
    default:
      return DEFAULT_AI_MODEL;
  }
}

/** Returns the AI provider ("claude" | "codex" | "opencode") for a given model string. */
export function getAIModelProvider(
  model: string | null | undefined,
): AIProvider {
  const normalized = normalizeAIModel(model);
  if (normalized.startsWith("codex:")) return "codex";
  if (normalized.startsWith("opencode:")) return "opencode";
  if (normalized.startsWith("cursor:")) return "cursor";
  return "claude";
}

/** Interactive chat providers that keep one sandbox-local process alive across turns. */
export function usesChatDaemon(model: string | null | undefined): boolean {
  const provider = getAIModelProvider(model);
  return provider === "claude" || provider === "codex" || provider === "cursor";
}

/**
 * Per-model trait capabilities (reasoning levels, thinking toggle, 1M context).
 */
export function getModelTraits(model: string | null | undefined): ModelTraits {
  const option = findAIModelOption(model);
  return {
    ...(option.reasoning ? { reasoning: option.reasoning } : {}),
    ...(option.thinkingToggle ? { thinkingToggle: true } : {}),
    ...(option.contextWindow1m ? { contextWindow1m: true } : {}),
    ...(option.contextWindowDefaultLabel
      ? { contextWindowDefaultLabel: option.contextWindowDefaultLabel }
      : {}),
    ...(option.fastMode ? { fastMode: true } : {}),
  };
}

/** Resolves stored effort to a valid level for the model, or undefined when no reasoning trait. */
export function resolveReasoningLevel(
  model: string | null | undefined,
  stored: ReasoningLevel | undefined,
): ReasoningLevel | undefined {
  const { reasoning } = getModelTraits(model);
  if (!reasoning) return undefined;
  if (stored && reasoning.levels.includes(stored)) return stored;
  return reasoning.default;
}

export function modelHasTraits(model: string | null | undefined): boolean {
  const traits = getModelTraits(model);
  return Boolean(
    traits.reasoning ||
    traits.thinkingToggle ||
    traits.contextWindow1m ||
    traits.fastMode,
  );
}

export function getReasoningLevelLabel(level: string): string {
  switch (level) {
    case "off":
      return "Minimal";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "Extra High";
    case "max":
      return "Max";
    default:
      return level;
  }
}

/** Display values for the traits menu (stored undefined → model defaults). */
export function resolveTraitsForDisplay(
  model: string | null | undefined,
  stored: StoredModelTraits,
): {
  effortLevel: ReasoningLevel | undefined;
  thinkingEnabled: boolean;
  use1mContext: boolean;
  fastMode: boolean;
} {
  const traits = getModelTraits(model);
  return {
    effortLevel: traits.reasoning
      ? resolveReasoningLevel(model, stored.effortLevel)
      : undefined,
    thinkingEnabled: stored.thinkingEnabled ?? true,
    use1mContext: stored.use1mContext ?? false,
    fastMode: stored.fastMode ?? false,
  };
}

/**
 * Build execution payload: only non-default trait overrides are included so the
 * runner uses each model's native defaults when the user has not changed them.
 */
export function buildTraitsExecutionPayload(
  model: string | null | undefined,
  stored: StoredModelTraits,
): ModelTraitsExecutionArgs {
  const traits = getModelTraits(model);
  const payload: ModelTraitsExecutionArgs = {};

  if (traits.reasoning && stored.effortLevel !== undefined) {
    const { default: defaultLevel } = traits.reasoning;
    if (stored.effortLevel !== defaultLevel) {
      const resolved = resolveReasoningLevel(model, stored.effortLevel);
      if (resolved) {
        payload.reasoningLevel = resolved;
      }
    }
  }

  if (traits.thinkingToggle && stored.thinkingEnabled === false) {
    payload.thinkingEnabled = false;
  }

  if (traits.contextWindow1m && stored.use1mContext === true) {
    payload.use1mContext = true;
  }

  // Fast is deliberately explicit: Cursor first-party models can otherwise
  // resolve a bare model id to their higher-priced Fast variant.
  if (traits.fastMode) {
    payload.fastMode = stored.fastMode === true;
  }

  return payload;
}

/**
 * Stored run traits (session/task/project `last*` fields) normalised exactly as
 * the composer sends them, so every prewarm computes the same daemon opts
 * signature as the turn path. Forwarding the stored values verbatim mismatches:
 * a stored default level (e.g. Claude's "high") or a stored `fastMode: false`
 * on a model without the Fast trait produce sig fragments the send path omits,
 * so the warm daemon gets killed and respawned on every page open.
 */
export function launchTraitsFromStored(
  model: string | null | undefined,
  stored: {
    reasoningLevel?: ReasoningLevel;
    thinkingEnabled?: boolean;
    use1mContext?: boolean;
    fastMode?: boolean;
  },
): ModelTraitsExecutionArgs {
  return buildTraitsExecutionPayload(model, {
    effortLevel: stored.reasoningLevel,
    thinkingEnabled: stored.thinkingEnabled,
    use1mContext: stored.use1mContext,
    fastMode: stored.fastMode,
  });
}

/** Repo-config default traits, shaped for the composer traits menu. */
export function storedTraitsFromRepoDefaults(repo: {
  defaultReasoningLevel?: ReasoningLevel;
  defaultThinkingEnabled?: boolean;
  defaultUse1mContext?: boolean;
  defaultFastMode?: boolean;
}): StoredModelTraits {
  return {
    effortLevel: repo.defaultReasoningLevel,
    thinkingEnabled: repo.defaultThinkingEnabled,
    use1mContext: repo.defaultUse1mContext,
    fastMode: repo.defaultFastMode,
  };
}

/** Finds the full AIModelOption metadata for a given model string, falling back to the default. */
export function findAIModelOption(
  model: string | null | undefined,
): AIModelOption {
  const normalized = normalizeAIModel(model);
  const option = AI_MODEL_OPTIONS.find((entry) => entry.id === normalized);
  if (option) {
    return option;
  }
  return {
    id: DEFAULT_AI_MODEL,
    provider: "claude",
    label: "Sonnet",
    requiresAuth: true,
  };
}

/** Checks whether any Codex authentication environment variable is present and non-empty. */
export function hasCodexAuthEnvVar(envVars: Record<string, string>): boolean {
  return CODEX_AUTH_ENV_KEYS.some((key) => {
    const value = envVars[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

/** Returns the list of AI model options visible to the user based on provider availability. */
export function getVisibleAIModelOptions(
  availability: AIProviderAvailability | null | undefined,
  currentModel: string | null | undefined,
): ReadonlyArray<AIModelOption> {
  const normalizedCurrent = normalizeAIModel(currentModel);
  const currentProvider = getAIModelProvider(normalizedCurrent);
  const isClaudeVisible =
    availability === undefined ||
    availability === null ||
    availability.claude ||
    currentProvider === "claude";
  const isCodexVisible =
    availability?.codex === true || currentProvider === "codex";
  const isOpencodeVisible =
    availability?.opencode === true || currentProvider === "opencode";
  const isCursorVisible =
    availability?.cursor === true || currentProvider === "cursor";
  return AI_MODEL_OPTIONS.filter((option) => {
    if (option.provider === "codex") {
      return isCodexVisible;
    }
    if (option.provider === "opencode") {
      return isOpencodeVisible;
    }
    if (option.provider === "cursor") {
      return isCursorVisible;
    }
    return isClaudeVisible;
  });
}

/**
 * Simple view keeps one current model per provider family: the Claude models we
 * recommend, the latest Codex generation, and Cursor's latest Grok/Composer.
 * Everything else stays selectable in the normal UI — this only trims the list.
 */
const SIMPLE_VIEW_MODEL_IDS: ReadonlySet<AIModel> = new Set<AIModel>([
  "claude:claude-fable-5-1",
  "claude:opus",
  "claude:sonnet",
  "codex:gpt-6-astra",
  "codex:gpt-5.6-sol",
  "codex:gpt-5.6-terra",
  "codex:gpt-5.6-luna",
  "cursor:grok-4.6",
  "cursor:grok-4.5",
  "cursor:composer-2.5",
  "opencode:openai/gpt-6-astra",
]);

/**
 * Capability ladder for the simple-view slider, cheapest → strongest.
 * Advanced still lists the trimmed set above; this is only the five ticks.
 */
export const SIMPLE_VIEW_MODEL_LADDER: ReadonlyArray<AIModel> = [
  "cursor:composer-2.5",
  "cursor:grok-4.5",
  "cursor:grok-4.6",
  "claude:opus",
  "claude:claude-fable-5-1",
];

/**
 * Maps any current model onto a ladder tick so the slider has a position
 * without rewriting the selection. Moving the thumb commits a ladder model.
 */
export function snapToSimpleViewLadder(model: string): AIModel {
  const normalized = normalizeAIModel(model);
  for (const step of SIMPLE_VIEW_MODEL_LADDER) {
    if (step === normalized) return step;
  }
  if (normalized.includes("fable")) return "claude:claude-fable-5-1";
  if (getAIModelProvider(normalized) === "claude") return "claude:opus";
  if (normalized.includes("composer")) return "cursor:composer-2.5";
  if (normalized.includes("grok-4.5")) return "cursor:grok-4.5";
  return "cursor:grok-4.6";
}

/**
 * Trims the picker to the simple-view set. The current model is always kept so
 * a session already running on an older model still shows its own name.
 */
export function getSimpleViewModelOptions(
  options: ReadonlyArray<AIModelOption>,
  currentModel: string | null | undefined,
): ReadonlyArray<AIModelOption> {
  const normalizedCurrent = normalizeAIModel(currentModel);
  return options.filter(
    (option) =>
      SIMPLE_VIEW_MODEL_IDS.has(option.id) || option.id === normalizedCurrent,
  );
}
