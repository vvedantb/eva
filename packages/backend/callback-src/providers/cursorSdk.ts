import { mkdirSync, readFileSync } from "fs";
import type {
  Agent,
  AgentOptions,
  AgentUsage,
  Cursor,
  ModelListItem,
  ModelParameterValue,
  ModelSelection,
  Run,
  SDKAgent,
  TokenUsage,
  UsageCost,
} from "@cursor/sdk";
import type { SqliteLocalAgentStore } from "@cursor/sdk/sqlite";
import {
  CURSOR_SDK_STORE_DIR,
  MAX_TOTAL_RUNTIME_MS,
  NO_WRITES,
  NO_OUTPUT_CHECK_INTERVAL_MS,
  NO_OUTPUT_TIMEOUT_MS,
  SYSTEM_PROMPT,
  WORK_DIR,
  cursorFastMode,
  cursorReasoningLevel,
  cursorUse1mContext,
  normalizedCursorModel,
} from "../config.js";
import { evaMcpServers } from "../evaMcp.js";
import { cursorCompactionEventPhase } from "./cursor.js";
import { pushNoticeStep, updateThinkingStep } from "../parse/canonical.js";
import { emitParsedStreamLine } from "../parse/streamRouter.js";
import {
  appendToRawLogFile,
  recordSdkAttemptFailure,
  recordSdkRetry,
} from "../runtime/buffers.js";
import { callbackState as S, resetAttemptState } from "../runtime/state.js";
import {
  syncCursorStateToPersist,
  writeCursorSessionState,
} from "../session/cursorSession.js";
import type {
  JsonValue,
  ProviderAttemptResult,
  SessionMode,
} from "../types.js";
import { log } from "../utils.js";
import { buildStandardSdkAttemptResult } from "./attemptResult.js";
import { resolvePinnedSdkEntry, type JsonLike } from "./claudeSdk.js";

const SDK_PACKAGE = "@cursor/sdk";
const SDK_VERSION = "1.0.28";
/** ESM entry inside the package (its exports map's `import` target). */
const SDK_ENTRY_RELPATH = "/dist/esm/index.js";
/**
 * SQLite store entry (`@cursor/sdk/sqlite`). The package ships it apart from
 * the main entry so importing the SDK does not load the sqlite driver.
 */
const SDK_SQLITE_ENTRY_RELPATH = "/dist/esm/sqlite.js";

/** SDK setup should return a local handle quickly; model work happens later. */
const CURSOR_AGENT_SETUP_TIMEOUT_MS = 30_000;
/**
 * Env var the SDK reads inside `Agent.create`/`Agent.resume` instead of its own
 * `listModels()` network call to validate the configured model id. Eva already
 * fetches that same list in `resolveCursorModelSelection`, so it publishes the
 * catalog here and agent setup then has no remote dependency left — the second,
 * redundant round trip is what timed out on this deadline in prod.
 *
 * The name is undocumented in the SDK, so a contract test pins it against the
 * pinned SDK bundle.
 */
export const CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV =
  "CURSOR_SDK_LOCAL_MODEL_CATALOG_JSON";
/** `Agent.send` only creates the run. A minute here is a wedged SDK session. */
const CURSOR_SEND_START_TIMEOUT_MS = 60_000;
/**
 * Silence budget before the first visible event, rolling from the last SDK
 * event of ANY type: a stream still emitting lifecycle events (status, usage,
 * compaction summaries) is a live agent, not a stall. Only total silence
 * trips it — and before visible output, replaying the SAME agent is still
 * safe. Matches Claude's `NO_OUTPUT_TIMEOUT_MS × 5` silence kill: a resumed
 * grok-4.6 xhigh turn routinely thinks (or silently compacts) for more than
 * one minute before thinking/assistant/tool_call, and the old 60s budget
 * false-triggered a replacement agent that wiped the session.
 */
const CURSOR_FIRST_VISIBLE_EVENT_TIMEOUT_MS = NO_OUTPUT_TIMEOUT_MS * 5;
/** Once output exists, allow long model pauses without replaying or aborting. */
const CURSOR_POST_EVENT_SILENCE_TIMEOUT_MS = NO_OUTPUT_TIMEOUT_MS * 5;
const CURSOR_RESULT_SETTLE_TIMEOUT_MS = 30_000;

export type CursorPhase =
  | "fetching the model list"
  | "creating a fresh agent"
  | "restoring saved context"
  | "starting the model run"
  | "waiting for the first model event"
  | "waiting for the next model event"
  | "finishing the model run";

export class CursorPhaseTimeoutError extends Error {
  constructor(
    readonly phase: CursorPhase,
    readonly timeoutMs: number,
  ) {
    super(
      "Cursor stalled while " +
        phase +
        " for " +
        Math.round(timeoutMs / 1000) +
        " seconds.",
    );
    this.name = "CursorPhaseTimeoutError";
  }
}

/** Adds a real deadline to SDK promises whose own cancellation can be a no-op. */
export async function waitForCursorPhase<T>(args: {
  task: Promise<T>;
  phase: CursorPhase;
  timeoutMs: number;
  onTimeout?: () => void;
}): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => {
      try {
        args.onTimeout?.();
      } catch {
        /* the timeout still owns the result */
      }
      reject(new CursorPhaseTimeoutError(args.phase, args.timeoutMs));
    }, args.timeoutMs);
  });
  try {
    return await Promise.race([args.task, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Safe to retry only before a resumed run emitted anything user-visible. */
export function shouldRetryStalledCursorResume(error: Error): boolean {
  return (
    error instanceof CursorPhaseTimeoutError &&
    (error.phase === "starting the model run" ||
      error.phase === "waiting for the first model event")
  );
}

/**
 * A creation that never returned a handle has no context to lose, so reissuing
 * it is always safe. Creation is only the first turn or a wiped store
 * (`agent_not_found`); a stalled resume must never reach this path.
 */
export function shouldRetryStalledCursorCreate(error: Error): boolean {
  return (
    error instanceof CursorPhaseTimeoutError &&
    error.phase === "creating a fresh agent"
  );
}

/**
 * The persisted agent IS the session, the way Claude's `resume: sessionId`
 * is. A replacement is only legal when the store no longer has that agent —
 * any other error (including a pre-output stall) must keep the saved id so
 * the next turn resumes it instead of minting a blank conversation.
 */
export function canReplaceCursorAgent(error: Error): boolean {
  return isAgentNotFound(error);
}

/** SDK events that prove the user has seen model work and replay is unsafe. */
export function cursorEventHasVisibleActivity(type: string): boolean {
  return type === "thinking" || type === "assistant" || type === "tool_call";
}

export function cursorEventWaitTimeoutMs(args: {
  sawVisibleActivity: boolean;
  lastEventAt: number;
  now: number;
  toolInFlight: boolean;
  compactionInFlight: boolean;
}): number {
  // An in-place compaction can outlast every silence budget and MUST NOT be
  // mistaken for a hang: replacing a compacting agent is exactly the agent
  // rotation the resume-always design exists to prevent.
  if (args.toolInFlight || args.compactionInFlight) return MAX_TOTAL_RUNTIME_MS;
  if (args.sawVisibleActivity) return CURSOR_POST_EVENT_SILENCE_TIMEOUT_MS;
  return Math.max(
    1,
    args.lastEventAt + CURSOR_FIRST_VISIBLE_EVENT_TIMEOUT_MS - args.now,
  );
}

/** Official SDK types are erased from the standalone callback bundle. */
type SdkModelParameterValue = ModelParameterValue;
type SdkModelSelection = ModelSelection;

export function cursorModeParams(
  model: string,
  fastMode: boolean,
  use1mContext: boolean,
): SdkModelParameterValue[] {
  const params: SdkModelParameterValue[] = [];
  if (
    model === "grok-4.6" ||
    model === "grok-4.5" ||
    model === "composer-2.5"
  ) {
    params.push({ id: "fast", value: fastMode ? "true" : "false" });
  }
  if (use1mContext) {
    params.push({ id: "context", value: "1m" });
  }
  return params;
}

type SdkModel = ModelListItem;

/**
 * The `fast`/`context` parameter ids are not documented, so never trust them
 * blindly: with the model's Cursor.models.list() entry in hand, keep only the
 * params the model declares (matching id, and value when values are listed).
 * Without an entry (list failed, model absent) keep only the params the user
 * explicitly opted into — a wrong id then breaks the run the user asked for,
 * never the default runs of users who touched nothing.
 */
export function filterModeParamsByModel(
  candidates: SdkModelParameterValue[],
  model: SdkModel | undefined,
  opted: { fastMode: boolean; use1mContext: boolean },
): SdkModelParameterValue[] {
  if (!model) {
    return candidates.filter((param) =>
      param.id === "fast" ? opted.fastMode : opted.use1mContext,
    );
  }
  const definitions = Array.isArray(model.parameters) ? model.parameters : [];
  return candidates.filter((param) =>
    definitions.some((definition) => {
      if (!definition || definition.id !== param.id) return false;
      const values = Array.isArray(definition.values) ? definition.values : [];
      return (
        values.length === 0 ||
        values.some((entry) => entry && entry.value === param.value)
      );
    }),
  );
}

type SdkAgentOptions = AgentOptions;

/**
 * Cursor's built-in tools that modify the workspace, denied when `NO_WRITES`.
 *
 * A denylist rather than the sibling `tools` allowlist: the SDK documents
 * `disallowedTools` as "everything else in the default toolset remains
 * available — including tools added to the platform after this SDK was
 * released", so an SDK bump cannot silently strip Ave's read-only tools. An
 * allowlist would have to be revisited on every upgrade.
 *
 * `shell` and `mcp` are deliberately absent: the master reads production logs
 * through the shell, and `mcp` is a capability group whose omission "disables
 * MCP entirely" — which would remove the very orchestration tools it exists to
 * use. Shell writes are therefore prompt-enforced, not tool-enforced.
 *
 * Passed via the shared `options` object, so it reaches both `Agent.create` and
 * `Agent.resume` — required, because the SDK does not persist it on the agent.
 */
const CURSOR_WRITE_TOOLS: NonNullable<AgentOptions["disallowedTools"]> = [
  "edit",
  "delete",
  "applyAgentDiff",
];

type SdkTokenUsage = TokenUsage;
type SdkAgentUsage = AgentUsage;
type SdkUsageCost = UsageCost;
type SdkRun = Run;
type SdkAgent = SDKAgent;

type CursorSdkModule = {
  Agent: typeof Agent;
  Cursor: typeof Cursor;
};

type CursorSdkSqliteModule = {
  SqliteLocalAgentStore: typeof SqliteLocalAgentStore;
};

let loadedSdk: CursorSdkModule | null = null;
let loadedSdkSqlite: CursorSdkSqliteModule | null = null;

/**
 * Imports the Cursor SDK version `cursorParseLine` was written against. Taking
 * whatever the sandbox happens to hold is not safe here: the parser matches the
 * 1.0.x message type names exactly, so a drifted SDK streams events it drops on
 * the floor and the turn renders as a bare "Working..." for its whole duration.
 */
async function loadCursorSdk(): Promise<CursorSdkModule> {
  // Memoized so the warm daemon pays the resolve (`npm root -g`, manifest
  // reads) and the import once for the whole session instead of once per turn.
  // The one-shot path calls this exactly once, so nothing changes there.
  if (loadedSdk) return loadedSdk;
  const mod: CursorSdkModule = await import(
    resolvePinnedSdkEntry({
      packageName: SDK_PACKAGE,
      version: SDK_VERSION,
      entryRelPath: SDK_ENTRY_RELPATH,
    })
  );
  loadedSdk = mod;
  return mod;
}

/**
 * Imports the same pinned SDK's separate sqlite entry. Kept apart from
 * `loadCursorSdk` because the package ships it as its own export precisely so
 * the main entry does not pull in the sqlite driver, and the two imports must
 * stay independent for that to hold.
 */
async function loadCursorSdkSqlite(): Promise<CursorSdkSqliteModule> {
  if (loadedSdkSqlite) return loadedSdkSqlite;
  const mod: CursorSdkSqliteModule = await import(
    resolvePinnedSdkEntry({
      packageName: SDK_PACKAGE,
      version: SDK_VERSION,
      entryRelPath: SDK_SQLITE_ENTRY_RELPATH,
    })
  );
  loadedSdkSqlite = mod;
  return mod;
}

function readPromptText(): string {
  return readFileSync("/tmp/design-prompt.txt", "utf8");
}

/**
 * Serializes a fetched model list into the catalog JSON the SDK accepts, or
 * `null` when the list cannot stand in for the SDK's own fetch. The SDK rejects
 * a malformed catalog with a non-retryable error, so an empty list or an entry
 * without a string `id` is dropped rather than published. Only `id` and
 * `aliases` are kept — the SDK matches on nothing else, and the value lives in
 * the environment of every child process the turn spawns.
 */
export function cursorModelCatalogJson(
  models: ReadonlyArray<ModelListItem>,
): string | null {
  if (models.length === 0) return null;
  const valid = models.every(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      typeof entry.id === "string",
  );
  if (!valid) return null;
  return JSON.stringify(
    models.map((entry) =>
      Array.isArray(entry.aliases)
        ? { id: entry.id, aliases: entry.aliases }
        : { id: entry.id },
    ),
  );
}

/**
 * Builds the SDK ModelSelection for the configured eva model. Eva slugs bake a
 * reasoning level into the id (grok-4.5-low); the SDK's model list carries the
 * base id with reasoning exposed as a per-model parameter whose id is not
 * documented — so discover it from Cursor.models.list() at runtime: first a
 * parameter definition allowing the level value, then a variant carrying it.
 * A reasoning miss (no level, list unavailable, model/parameter absent) keeps
 * the base id and any explicitly selected Fast or context parameters.
 */
async function resolveCursorModelSelection(
  sdk: CursorSdkModule,
): Promise<SdkModelSelection> {
  const base = normalizedCursorModel;
  const level = cursorReasoningLevel;
  // Cursor first-party models can default to their higher-priced Fast variant,
  // so send the explicit boolean — but only once the model's parameter list
  // confirms the undocumented id (filterModeParamsByModel). Context is opt-in.
  const candidates = cursorModeParams(base, cursorFastMode, cursorUse1mContext);
  const opted = { fastMode: cursorFastMode, use1mContext: cursorUse1mContext };
  if (candidates.length === 0 && !level) {
    return { id: base };
  }

  let model: SdkModel | undefined;
  let listUnavailable = false;
  try {
    const list = sdk.Cursor?.models?.list;
    if (list) {
      // The fetch had no deadline of its own, so a hung list could burn the
      // whole turn before agent setup even started.
      const models = await waitForCursorPhase({
        task: list(),
        phase: "fetching the model list",
        timeoutMs: CURSOR_AGENT_SETUP_TIMEOUT_MS,
      });
      if (Array.isArray(models)) {
        // Hand the SDK the list it would otherwise fetch again itself inside
        // Agent.create/Agent.resume, so agent setup stays local.
        const catalog = cursorModelCatalogJson(models);
        if (catalog) process.env[CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV] = catalog;
      }
      model = Array.isArray(models)
        ? models.find(
            (entry) => entry && typeof entry === "object" && entry.id === base,
          )
        : undefined;
      if (!model) {
        log(
          "resolveCursorModelSelection: model " +
            base +
            " not in Cursor.models.list — keeping opted-in params only",
        );
      }
    } else {
      listUnavailable = true;
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    listUnavailable = true;
    log(
      "resolveCursorModelSelection: model list failed — keeping opted-in params only (" +
        messageText +
        ")",
    );
  }

  const params = filterModeParamsByModel(candidates, model, opted);
  if (params.length < candidates.length && model) {
    log(
      "resolveCursorModelSelection: " +
        base +
        " does not declare " +
        candidates
          .filter((candidate) => !params.some((p) => p.id === candidate.id))
          .map((candidate) => candidate.id)
          .join(", ") +
        " — dropped",
    );
  }
  if (!level || listUnavailable || !model) {
    return params.length > 0 ? { id: base, params } : { id: base };
  }

  for (const definition of model.parameters ?? []) {
    if (!definition || typeof definition.id !== "string") continue;
    const values = Array.isArray(definition.values) ? definition.values : [];
    if (values.some((entry) => entry && entry.value === level)) {
      log(
        "resolveCursorModelSelection: " +
          base +
          " reasoning level " +
          level +
          " via parameter " +
          definition.id,
      );
      params.push({ id: definition.id, value: level });
      return { id: base, params };
    }
  }
  for (const variant of model.variants ?? []) {
    const variantParams = Array.isArray(variant?.params) ? variant.params : [];
    if (variantParams.some((param) => param && param.value === level)) {
      log(
        "resolveCursorModelSelection: " +
          base +
          " reasoning level " +
          level +
          " via variant params",
      );
      const remainingVariantParams = variantParams.filter(
        (variantParam) => !params.some((param) => param.id === variantParam.id),
      );
      return { id: base, params: [...params, ...remainingVariantParams] };
    }
  }
  log(
    "resolveCursorModelSelection: " +
      base +
      " exposes no parameter accepting '" +
      level +
      "' — sending base id",
  );
  return params.length > 0 ? { id: base, params } : { id: base };
}

/** Reads an SDK error's `code` field without assertions (Error → overlap via message). */
function errorCode(error: Error): string {
  const withCode: { message: string; code?: string } = error;
  return typeof withCode.code === "string" ? withCode.code : "";
}

function isAgentNotFound(error: Error): boolean {
  return (
    errorCode(error) === "agent_not_found" ||
    error.message.includes("agent_not_found")
  );
}

/**
 * Cursor's backend rejects a run with the Connect-RPC code
 * `resource_exhausted` (its HTTP 429: rate limit or usage quota) — observed in
 * prod as a grok-4.6 turn erroring after ~40s with zero tokens used. The
 * condition is usually transient, so retry with backoff before surfacing, and
 * surface a readable message instead of the raw `[resource_exhausted] Error`.
 */
export const RESOURCE_EXHAUSTED_RETRY_DELAYS_MS = [15_000, 30_000];

export function isResourceExhaustedMessage(text: string): boolean {
  return text.includes("resource_exhausted");
}

export const RESOURCE_EXHAUSTED_CHAT_MESSAGE =
  "Cursor rejected the request: rate limit or usage quota exhausted " +
  "(resource_exhausted). No tokens were used. Wait a minute and try again, " +
  "or switch to a different model.";

type UsageTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type CursorTurnOutcome = {
  isError: boolean;
  resultText: string;
  durationMs: number;
  usage: UsageTokens;
  /** Undiscounted model cost of this turn, absent when Cursor did not report it. */
  costUsd?: number;
};

/**
 * Cost the Cursor backend has billed an agent, normalized from `getUsage()`.
 * `null` cost means "not reported (yet)", which is distinct from a reported 0
 * (request-priced, plan-included and BYOK usage all bill 0 raw cents).
 */
export type CursorCostSnapshot = {
  /** Agent-lifetime raw cost in float cents. */
  totalRawCents: number | null;
  /** Per-turn groups, keyed by the backend's usage UUID (not our run id). */
  entries: { runId: string; rawCents: number | null }[];
};

/** A never-billed agent: the correct baseline for an agent created just now. */
export const EMPTY_CURSOR_COST_SNAPSHOT: CursorCostSnapshot = {
  totalRawCents: null,
  entries: [],
};

/** Reads the `AgentUsage` returned by `agent.getUsage()` into a cost snapshot. */
export function readCursorCostSnapshot(
  value: SdkAgentUsage | JsonLike | undefined,
): CursorCostSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_CURSOR_COST_SNAPSHOT;
  }
  const runs = Array.isArray(value.runs) ? value.runs : [];
  const entries: CursorCostSnapshot["entries"] = [];
  for (const run of runs) {
    if (!run || typeof run !== "object" || Array.isArray(run)) continue;
    if (typeof run.runId !== "string" || !run.runId) continue;
    entries.push({ runId: run.runId, rawCents: readRawCents(run.cost) });
  }
  return { totalRawCents: readRawCents(value.cost), entries };
}

function readRawCents(
  cost: SdkUsageCost | JsonLike | undefined,
): number | null {
  if (!cost || typeof cost !== "object" || Array.isArray(cost)) return null;
  const raw = cost.rawCostCents;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function sumKnownRawCents(entries: CursorCostSnapshot["entries"]): number {
  return entries.reduce((total, entry) => total + (entry.rawCents ?? 0), 0);
}

/**
 * Raw cents this turn cost, or `null` while nothing is attributable to it yet.
 *
 * `getUsage()` reports an agent's whole life, so a resumed agent's totals carry
 * every prior turn — the turn's own cost has to be isolated by diffing. Each
 * local turn is its own usage-UUID group, so this turn's groups are exactly the
 * ones absent from the pre-send snapshot. Cost that appears on a group that
 * already existed is deliberately ignored: that is a *previous* turn's cost
 * landing late, and charging it here would inflate this turn.
 *
 * Local events the backend records without a usage UUID never get a group, so
 * their only trace is the remainder between the totals and the groups; its
 * growth is counted too, and it is the one component that cannot be told apart
 * from a late-landing prior turn, hence the "only when it grew" guard.
 */
export function attributeCursorTurnRawCents(
  before: CursorCostSnapshot,
  after: CursorCostSnapshot,
): number | null {
  const knownRunIds = new Set(before.entries.map((entry) => entry.runId));
  let attributed = 0;
  let attributable = false;
  for (const entry of after.entries) {
    if (entry.rawCents === null || knownRunIds.has(entry.runId)) continue;
    attributed += entry.rawCents;
    attributable = true;
  }
  if (after.totalRawCents !== null) {
    const remainderAfter =
      after.totalRawCents - sumKnownRawCents(after.entries);
    const remainderBefore =
      before.totalRawCents === null
        ? 0
        : before.totalRawCents - sumKnownRawCents(before.entries);
    if (remainderAfter - remainderBefore > 0) {
      attributed += remainderAfter - remainderBefore;
      attributable = true;
    }
  }
  return attributable ? attributed : null;
}

/**
 * Cursor derives cost server-side and it can lag briefly after a run ends while
 * billing events land, so poll a few times before giving up.
 */
export const COST_LOOKUP_RETRY_DELAYS_MS = [2_000, 2_000];

/**
 * Dollars this turn cost, or `undefined` when Cursor never reported it — the
 * downstream parser then defaults to 0, so a missing cost is never fatal.
 * A missing baseline (`before === null`, i.e. the pre-send lookup failed on a
 * resumed agent) resolves to `undefined` rather than charging this turn for the
 * agent's whole history.
 */
export async function resolveCursorTurnCostUsd(deps: {
  before: CursorCostSnapshot | null;
  fetchAfter: () => Promise<CursorCostSnapshot | null>;
  sleep: (delayMs: number) => Promise<void>;
  retryDelaysMs?: readonly number[];
}): Promise<number | undefined> {
  if (!deps.before) return undefined;
  const delays = deps.retryDelaysMs ?? COST_LOOKUP_RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt++) {
    const after = await deps.fetchAfter();
    const rawCents = after
      ? attributeCursorTurnRawCents(deps.before, after)
      : null;
    if (rawCents !== null) {
      // Float cents to dollars, at a precision cents can actually carry.
      return Math.round((rawCents / 100) * 1e6) / 1e6;
    }
    const delayMs = delays[attempt];
    if (delayMs === undefined) return undefined;
    await deps.sleep(delayMs);
  }
}

const ZERO_USAGE: UsageTokens = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

function readNum(value: JsonLike | number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Runs a turn, absorbing transient `resource_exhausted` rejections — Cursor
 * signals them both as an error run status and as a thrown SDK error, so both
 * paths retry. Only the final outcome is returned, so a retried failure never
 * reaches the parser as a result line. An exhausted retry budget resolves with
 * the readable chat message instead of the raw `[resource_exhausted] Error`;
 * any other error propagates untouched, and an attempt already aborted by a
 * timeout stops retrying so the run can wind down.
 */
export async function runTurnWithResourceExhaustedRetries(deps: {
  runTurn: () => Promise<CursorTurnOutcome>;
  aborted: () => boolean;
  onRetry: (delayMs: number, attempt: number) => void;
  sleep: (delayMs: number) => Promise<void>;
}): Promise<CursorTurnOutcome> {
  for (let attempt = 0; ; attempt++) {
    const retryDelayMs = RESOURCE_EXHAUSTED_RETRY_DELAYS_MS[attempt];
    let outcome: CursorTurnOutcome;
    try {
      outcome = await deps.runTurn();
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
      if (
        !isResourceExhaustedMessage(messageText) ||
        retryDelayMs === undefined ||
        deps.aborted()
      ) {
        throw error;
      }
      outcome = {
        isError: true,
        resultText: messageText,
        durationMs: 0,
        usage: ZERO_USAGE,
      };
    }
    if (!outcome.isError || !isResourceExhaustedMessage(outcome.resultText)) {
      return outcome;
    }
    if (retryDelayMs === undefined || deps.aborted()) {
      return { ...outcome, resultText: RESOURCE_EXHAUSTED_CHAT_MESSAGE };
    }
    deps.onRetry(retryDelayMs, attempt);
    await deps.sleep(retryDelayMs);
  }
}

/** Extracts camelCase TokenUsage fields from a stream `usage` event or RunResult. */
function readUsageTokens(
  value: JsonLike | SdkTokenUsage | undefined,
): UsageTokens | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    inputTokens: readNum(value.inputTokens),
    outputTokens: readNum(value.outputTokens),
    cacheReadTokens: readNum(value.cacheReadTokens),
    cacheWriteTokens: readNum(value.cacheWriteTokens),
  };
}

export type CursorAttemptOverrides = {
  /**
   * The turn's prompt. One-shot runs omit it and read the prompt file the
   * launch uploaded; the warm daemon has no such file (it launches with an
   * empty prompt) and passes the prompt it claimed instead.
   */
  promptText?: string;
  /**
   * Receives a handle that aborts this attempt's run. The daemon calls it when
   * a claim response drains a user cancel, so the attempt returns instead of
   * running to completion.
   */
  onAbortHandle?: (abort: () => void) => void;
};

/**
 * Runs one Cursor turn via the Cursor SDK (local agent in-process).
 *
 * Integration model mirrors runClaudeSdkAttempt: every SDK stream event is
 * serialized to a JSON line and pushed through the realtime pipeline
 * (processRealtimeStdoutChunk -> cursorParseLine -> canonical events ->
 * accumulated steps / session capture), so streaming, activity, session
 * persistence and completion share the same parser plumbing as other
 * providers. The turn result has no stream event in the SDK — it is
 * synthesized from run.wait() as a final `{type:"result"}` line, carrying the
 * SDK's real token usage (the CLI reported zeros).
 */
export async function runCursorSdkAttempt(
  sessionMode: SessionMode,
  overrides: CursorAttemptOverrides = {},
): Promise<ProviderAttemptResult> {
  resetAttemptState();
  S.activeAttemptStartedAt = Date.now();
  const startupActivity = cursorAgentStartupActivity(sessionMode);
  updateThinkingStep(startupActivity.label, startupActivity.detail);
  log(
    "runCursorSdkAttempt started (mode=" +
      sessionMode.mode +
      ", sessionId=" +
      (sessionMode.sessionId || "none") +
      ")",
  );

  let attemptOutput = "";
  let lastMessageAt = Date.now();
  let compactionInFlight = false;
  let timedOutForNoOutput = false;
  let timedOutForMaxRuntime = false;
  let sawResult = false;
  let resultIsError = false;
  let attemptErrorMessage = "";
  let lastStreamUsage: UsageTokens | null = null;
  let activeRun: SdkRun | null = null;
  let abortedByCaller = false;

  const cancelRun = (): void => {
    if (!activeRun) return;
    activeRun.cancel().catch(() => {
      /* already finished */
    });
  };
  // Registered before the first await so a cancel racing agent setup is not
  // dropped: `runTurn` re-applies the abort once the run exists.
  overrides.onAbortHandle?.(() => {
    abortedByCaller = true;
    cancelRun();
  });

  const sdk = await loadCursorSdk();
  const sqlite = await loadCursorSdkSqlite();
  mkdirSync(CURSOR_SDK_STORE_DIR, { recursive: true });
  // SQLite, not the SDK's JSONL store, because the JSONL store re-reads and
  // re-parses the whole file on every `get` and rewrites it whole on every
  // append, while a resumed `send()` hydrates the conversation one
  // `checkpoints.get` per stored blob — 56 of them after a single 12-tool-call
  // turn. Resume therefore cost time quadratic in conversation length and blew
  // CURSOR_SEND_START_TIMEOUT_MS twice per turn after a heavy first turn
  // (prod, 3 Sep 2026). In that reproduction the same resumed `send()` took
  // 24 ms against SQLite, whose reads and appends stay constant-time.
  //
  // Legacy `*.ndjson` files left in this directory are ignored: an agent id
  // saved before this change resumes as `agent_not_found` and the existing
  // recovery starts a fresh agent once. Deliberately no migration — reading
  // those files is the slow path being removed.
  const store = await sqlite.SqliteLocalAgentStore.open({
    workspaceRef: WORK_DIR,
    stateRoot: CURSOR_SDK_STORE_DIR,
  });
  const options: SdkAgentOptions = {
    apiKey: (process.env.CURSOR_API_KEY || "").trim(),
    model: await resolveCursorModelSelection(sdk),
    local: { cwd: WORK_DIR, store },
    ...(Object.keys(evaMcpServers).length > 0
      ? { mcpServers: evaMcpServers }
      : {}),
    ...(NO_WRITES ? { disallowedTools: [...CURSOR_WRITE_TOOLS] } : {}),
  };

  const persistAgentId = (agentId: string): void => {
    S.activeCursorSessionId = agentId;
    writeCursorSessionState();
    syncCursorStateToPersist();
  };

  const createFreshAgent = async (): Promise<SdkAgent> => {
    updateThinkingStep(
      "Starting a fresh Cursor agent...",
      "Creating a clean model context...",
    );
    const create = (): Promise<SdkAgent> =>
      waitForCursorPhase({
        task: sdk.Agent.create(options),
        phase: "creating a fresh agent",
        timeoutMs: CURSOR_AGENT_SETUP_TIMEOUT_MS,
      });
    let created: SdkAgent;
    try {
      created = await create();
    } catch (error) {
      // First turn or a wiped store: a stalled create holds no context, so
      // give it one more go before the turn dies.
      if (!(error instanceof Error) || !shouldRetryStalledCursorCreate(error)) {
        throw error;
      }
      log(
        "runCursorSdkAttempt: fresh agent creation stalled — retrying once (" +
          error.message +
          ")",
      );
      recordSdkRetry(error.message);
      created = await create();
    }
    persistAgentId(created.agentId);
    return created;
  };

  const resumeSavedAgent = async (
    savedSessionId: string,
  ): Promise<SdkAgent> => {
    updateThinkingStep(
      "Restoring Cursor context...",
      "Opening the saved agent...",
    );
    const resumed = await waitForCursorPhase({
      task: sdk.Agent.resume(savedSessionId, options),
      phase: "restoring saved context",
      timeoutMs: CURSOR_AGENT_SETUP_TIMEOUT_MS,
    });
    persistAgentId(resumed.agentId);
    return resumed;
  };

  // Resume is Claude-shaped: the persisted agent id is the conversation.
  // A wiped store (`agent_not_found`) is the only case that may mint a
  // replacement — Cursor cannot reopen a missing id the way Claude retries
  // `session` with the same id. Transient resume failures retry the SAME
  // agent; they must not fall through to createFreshAgent, which would
  // persist a blank id and make every later turn start over.
  let resumedExistingAgent = false;
  let agent: SdkAgent;
  if (sessionMode.mode === "resume" && sessionMode.sessionId) {
    try {
      agent = await resumeSavedAgent(sessionMode.sessionId);
      resumedExistingAgent = true;
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
      if (error instanceof Error && canReplaceCursorAgent(error)) {
        log(
          "runCursorSdkAttempt: saved agent gone — starting a fresh agent (" +
            messageText +
            ")",
        );
        recordSdkRetry("resume failed: " + messageText);
        agent = await createFreshAgent();
      } else {
        log(
          "runCursorSdkAttempt: resume failed — retrying the saved agent (" +
            messageText +
            ")",
        );
        recordSdkRetry("resume failed: " + messageText);
        try {
          agent = await resumeSavedAgent(sessionMode.sessionId);
          resumedExistingAgent = true;
        } catch (retryError) {
          if (
            retryError instanceof Error &&
            canReplaceCursorAgent(retryError)
          ) {
            const retryMessageText = retryError.message;
            log(
              "runCursorSdkAttempt: saved agent gone on retry — starting a fresh agent (" +
                retryMessageText +
                ")",
            );
            recordSdkRetry("resume retry failed: " + retryMessageText);
            agent = await createFreshAgent();
          } else {
            throw retryError;
          }
        }
      }
    }
  } else {
    agent = await createFreshAgent();
  }

  const promptText = overrides.promptText ?? readPromptText();
  const combinedPrompt = SYSTEM_PROMPT
    ? SYSTEM_PROMPT + "\n\n" + promptText
    : promptText;

  const healthTimer = setInterval(() => {
    const now = Date.now();
    if (now - S.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS) {
      timedOutForMaxRuntime = true;
      log("runCursorSdkAttempt: max runtime exceeded — cancelling run");
      cancelRun();
      return;
    }
    // The SDK emits nothing between a tool call and its result, so a long
    // silent tool is indistinguishable from a hang by message silence alone:
    // while a tool is in flight only the hard runtime cap applies, and the
    // silence clock restarts once the tool result lands. An in-place
    // compaction (summary-started .. summary-completed) is the same shape.
    if (S.inFlightToolUses > 0 || compactionInFlight) {
      lastMessageAt = now;
    }
    if (
      !sawResult &&
      now - lastMessageAt > CURSOR_POST_EVENT_SILENCE_TIMEOUT_MS
    ) {
      timedOutForNoOutput = true;
      log("runCursorSdkAttempt: no SDK events — cancelling run");
      cancelRun();
    }
  }, NO_OUTPUT_CHECK_INTERVAL_MS);

  const pushLine = (line: string): void => {
    emitParsedStreamLine(line);
    attemptOutput = trimBufferHead(attemptOutput + line);
  };

  /** `getUsage()` is one cloud round trip; a failure only costs us the cost. */
  const readCostSnapshot = async (
    activeAgent: SdkAgent,
  ): Promise<CursorCostSnapshot | null> => {
    try {
      return readCursorCostSnapshot(await activeAgent.getUsage());
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
      log(
        "runCursorSdkAttempt: getUsage failed — turn cost unavailable (" +
          messageText +
          ")",
      );
      return null;
    }
  };

  const runTurn = async (
    activeAgent: SdkAgent,
    agentIsFresh: boolean,
  ): Promise<CursorTurnOutcome> => {
    // An agent created in this attempt has never been billed, so its baseline
    // is zero by construction — no round trip, and a lookup failure can never
    // cost a first turn its cost. A resumed agent's totals carry its prior
    // turns, so read the baseline; the request is issued before the send and
    // only awaited after the run, so it never delays the turn. (A rejected
    // resource_exhausted retry bills nothing, so a fresh agent's baseline stays
    // zero across the retries within this attempt.)
    const costBefore = agentIsFresh
      ? Promise.resolve(EMPTY_CURSOR_COST_SNAPSHOT)
      : readCostSnapshot(activeAgent);
    // `force` expires a run left marked active by a killed prior callback
    // (user stop is a process-level kill); a no-op otherwise.
    updateThinkingStep(
      "Waiting for Cursor...",
      "Starting the Grok model run...",
    );
    const run = await waitForCursorPhase({
      task: activeAgent.send(combinedPrompt, {
        local: { force: true },
      }),
      phase: "starting the model run",
      timeoutMs: CURSOR_SEND_START_TIMEOUT_MS,
      onTimeout: () => activeAgent.close(),
    });
    activeRun = run;
    if (abortedByCaller) cancelRun();
    updateThinkingStep("Waiting for Grok...", "The model is thinking...");
    const messages = run.stream()[Symbol.asyncIterator]();
    let sawVisibleActivity = false;
    // Rolling liveness clock: any received SDK event restarts the pre-visible
    // window, so a resume that streams lifecycle events (status, compaction
    // summaries) while it warms up is never misread as a stall.
    lastMessageAt = Date.now();
    compactionInFlight = false;
    while (true) {
      const phase: CursorPhase = sawVisibleActivity
        ? "waiting for the next model event"
        : "waiting for the first model event";
      const next = await waitForCursorPhase({
        task: messages.next(),
        phase,
        timeoutMs: cursorEventWaitTimeoutMs({
          sawVisibleActivity,
          lastEventAt: lastMessageAt,
          now: Date.now(),
          toolInFlight: S.inFlightToolUses > 0,
          compactionInFlight,
        }),
        onTimeout: () => {
          timedOutForNoOutput = true;
          cancelRun();
        },
      });
      if (next.done) break;
      const message = next.value;
      if (cursorEventHasVisibleActivity(message.type)) {
        sawVisibleActivity = true;
      }
      const compactionPhase = cursorCompactionEventPhase(message.type);
      if (compactionPhase !== null) {
        compactionInFlight = compactionPhase === "started";
      }
      lastMessageAt = Date.now();
      pushLine(JSON.stringify(message) + "\n");
      if (message.type === "usage") {
        lastStreamUsage = readUsageTokens(message.usage) ?? lastStreamUsage;
      }
      if (timedOutForMaxRuntime || timedOutForNoOutput || abortedByCaller)
        break;
    }
    const result = await waitForCursorPhase({
      task: run.wait(),
      phase: "finishing the model run",
      timeoutMs: CURSOR_RESULT_SETTLE_TIMEOUT_MS,
      onTimeout: cancelRun,
    });
    const costUsd = await resolveCursorTurnCostUsd({
      before: await costBefore,
      fetchAfter: () => readCostSnapshot(activeAgent),
      sleep: (delayMs) =>
        new Promise((resolve) => setTimeout(resolve, delayMs)),
    });
    return {
      isError: result.status !== "finished",
      resultText:
        typeof result.result === "string" && result.result
          ? result.result
          : result.error && typeof result.error.message === "string"
            ? result.error.message
            : "",
      durationMs: readNum(result.durationMs),
      usage: readUsageTokens(result.usage) ?? lastStreamUsage ?? ZERO_USAGE,
      ...(costUsd === undefined ? {} : { costUsd }),
    };
  };

  const emitTurnResult = (outcome: CursorTurnOutcome): void => {
    const syntheticResult: JsonValue = {
      type: "result",
      is_error: outcome.isError,
      result: outcome.resultText,
      duration_ms: outcome.durationMs,
      // Omitted when Cursor reported no cost; the parser then defaults to 0.
      ...(outcome.costUsd === undefined
        ? {}
        : { total_cost_usd: outcome.costUsd }),
      usage: {
        input_tokens: outcome.usage.inputTokens,
        output_tokens: outcome.usage.outputTokens,
        cache_read_input_tokens: outcome.usage.cacheReadTokens,
        cache_creation_input_tokens: outcome.usage.cacheWriteTokens,
      },
    };
    pushLine(JSON.stringify(syntheticResult) + "\n");
    sawResult = true;
    resultIsError = outcome.isError;
  };

  const runTurnWithRetries = async (
    activeAgent: SdkAgent,
    agentIsFresh: boolean,
  ): Promise<void> => {
    emitTurnResult(
      await runTurnWithResourceExhaustedRetries({
        runTurn: () => runTurn(activeAgent, agentIsFresh),
        aborted: () =>
          timedOutForMaxRuntime || timedOutForNoOutput || abortedByCaller,
        onRetry: (retryDelayMs, attempt) => {
          log(
            "runCursorSdkAttempt: resource_exhausted — retrying in " +
              retryDelayMs +
              "ms (attempt " +
              (attempt + 1) +
              " of " +
              (RESOURCE_EXHAUSTED_RETRY_DELAYS_MS.length + 1) +
              ")",
          );
          recordSdkRetry(
            "resource_exhausted — waiting " + retryDelayMs + "ms before retry",
          );
          updateThinkingStep(
            "Cursor is rate-limited...",
            "Retrying in " + Math.round(retryDelayMs / 1000) + "s...",
          );
        },
        sleep: (delayMs) =>
          new Promise((resolve) => setTimeout(resolve, delayMs)),
      }),
    );
  };

  // Closes the failed agent and clears the attempt's stall bookkeeping so the
  // next recovery attempt starts from a clean clock.
  const resetForRecovery = (failedAgent: SdkAgent): void => {
    try {
      failedAgent.close();
    } catch {
      /* already closed */
    }
    activeRun = null;
    timedOutForNoOutput = false;
    lastMessageAt = Date.now();
    compactionInFlight = false;
  };

  try {
    try {
      await runTurnWithRetries(agent, !resumedExistingAgent);
    } catch (error) {
      // A resumed agent whose stored runs are unreadable can throw
      // agent_not_found past resume (at send/stream/wait), and a resumed run
      // can stall before its first event. The session's agent IS its memory
      // (Claude just resumes the same id and lets the model compact), so a
      // stall reopens the SAME agent once. A second stall fails the turn
      // instead of minting a blank replacement — persistAgentId on create
      // would overwrite the saved id and every later turn would start over.
      // Only a definitive agent_not_found may create: the store is gone.
      if (!resumedExistingAgent || !(error instanceof Error)) {
        throw error;
      }
      const savedSessionId = S.activeCursorSessionId || sessionMode.sessionId;
      if (canReplaceCursorAgent(error)) {
        log(
          "runCursorSdkAttempt: saved agent gone mid-run — starting a fresh agent (" +
            error.message +
            ")",
        );
        recordSdkRetry(error.message);
        resetForRecovery(agent);
        pushNoticeStep(
          "Started a fresh Cursor agent",
          "The saved agent could not be restored, so Eva recovered with a clean context.",
        );
        agent = await createFreshAgent();
        await runTurnWithRetries(agent, true);
      } else if (shouldRetryStalledCursorResume(error) && savedSessionId) {
        log(
          "runCursorSdkAttempt: resumed agent run stalled — retrying the same agent (" +
            error.message +
            ")",
        );
        recordSdkRetry(error.message);
        resetForRecovery(agent);
        pushNoticeStep(
          "Retrying the saved Cursor agent",
          "The run stalled before any output, so Eva reopened the same agent to keep its context.",
        );
        try {
          agent = await resumeSavedAgent(savedSessionId);
          await runTurnWithRetries(agent, false);
        } catch (retryError) {
          if (
            retryError instanceof Error &&
            canReplaceCursorAgent(retryError)
          ) {
            log(
              "runCursorSdkAttempt: saved agent gone on stall retry — starting a fresh agent (" +
                retryError.message +
                ")",
            );
            recordSdkRetry(retryError.message);
            resetForRecovery(agent);
            pushNoticeStep(
              "Started a fresh Cursor agent",
              "The saved agent could not be restored, so Eva recovered with a clean context.",
            );
            agent = await createFreshAgent();
            await runTurnWithRetries(agent, true);
          } else {
            throw retryError;
          }
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const messageText = isResourceExhaustedMessage(rawMessage)
      ? RESOURCE_EXHAUSTED_CHAT_MESSAGE
      : rawMessage;
    attemptErrorMessage = messageText;
    log("runCursorSdkAttempt: run failed — " + rawMessage);
    recordSdkAttemptFailure(rawMessage, { stderrMessage: messageText });
  } finally {
    clearInterval(healthTimer);
    try {
      agent.close();
    } catch {
      /* already closed */
    }
    try {
      await store.dispose();
    } catch {
      /* already closed */
    }
  }

  const code =
    sawResult &&
    !resultIsError &&
    !timedOutForMaxRuntime &&
    !timedOutForNoOutput
      ? 0
      : 1;
  log(
    "runCursorSdkAttempt finished in " +
      String(Date.now() - S.activeAttemptStartedAt) +
      "ms (code=" +
      code +
      ", sawResult=" +
      sawResult +
      ", resultIsError=" +
      resultIsError +
      ", timedOutForNoOutput=" +
      timedOutForNoOutput +
      ", timedOutForMaxRuntime=" +
      timedOutForMaxRuntime +
      ", outputBytes=" +
      attemptOutput.length +
      (attemptErrorMessage ? ", runError=" + attemptErrorMessage : "") +
      ")",
  );
  return buildStandardSdkAttemptResult({
    code,
    output: attemptOutput,
    timedOutForNoOutput,
    timedOutForMaxRuntime,
  });
}

/** User-facing startup copy must say whether this turn resumes or creates. */
export function cursorAgentStartupActivity(sessionMode: SessionMode): {
  label: string;
  detail: string;
} {
  return sessionMode.mode === "resume"
    ? {
        label: "Resuming Cursor agent...",
        detail: "Restoring saved context...",
      }
    : {
        label: "Creating Cursor agent...",
        detail: "Creating a new model context...",
      };
}
