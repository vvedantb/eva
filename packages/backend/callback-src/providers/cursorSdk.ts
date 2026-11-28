import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "fs";
import * as nodeModule from "node:module";
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
  CURSOR_RUNTIME_HOME_DIR,
  CURSOR_SDK_STORE_DIR,
  MAX_TOTAL_RUNTIME_MS,
  NO_OUTPUT_CHECK_INTERVAL_MS,
  NO_OUTPUT_TIMEOUT_MS,
  AGENT_CWD,
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
  recordSdkAttemptFailure,
  recordSdkRetry,
  trimBufferHead,
} from "../runtime/buffers.js";
import { callbackState as S } from "../runtime/state.js";
import {
  syncCursorStateToPersist,
  writeCursorSessionState,
} from "../session/cursorSession.js";
import type {
  JsonValue,
  ProviderAttemptResult,
  SessionMode,
} from "../types.js";
import {
  isJsonObject,
  log,
  readTurnPrompt,
  withSystemPrompt,
} from "../utils.js";
import { beginSdkAttempt, finishSdkAttempt } from "./attemptResult.js";
import { resolvePinnedSdkEntry, type JsonLike } from "./claudeSdk.js";

const SDK_PACKAGE = "@cursor/sdk";
const SDK_VERSION = "1.0.28";
const SDK_ENTRY_RELPATH = "/dist/esm/index.js";
const SDK_SQLITE_ENTRY_RELPATH = "/dist/esm/sqlite.js";

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
const CURSOR_SEND_START_TIMEOUT_MS = 60_000;
const CURSOR_FIRST_VISIBLE_EVENT_TIMEOUT_MS = NO_OUTPUT_TIMEOUT_MS * 5;
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
  if (args.toolInFlight || args.compactionInFlight) return MAX_TOTAL_RUNTIME_MS;
  if (args.sawVisibleActivity) return CURSOR_POST_EVENT_SILENCE_TIMEOUT_MS;
  return Math.max(
    1,
    args.lastEventAt + CURSOR_FIRST_VISIBLE_EVENT_TIMEOUT_MS - args.now,
  );
}

type SdkModelParameterValue = ModelParameterValue;
type SdkModelSelection = ModelSelection;

export function cursorModeParams(
  model: string,
  fastMode: boolean,
  use1mContext: boolean,
): SdkModelParameterValue[] {
  const params: SdkModelParameterValue[] = [];
  if (
    model === "grok-4.7" ||
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

function enableSdkCompileCache(): void {
  try {
    nodeModule.enableCompileCache?.();
  } catch {
  }
}

function flushSdkCompileCache(): void {
  try {
    nodeModule.flushCompileCache?.();
  } catch {
  }
}

let loadedSdk: Promise<CursorSdkModule> | null = null;
let loadedSdkSqlite: Promise<CursorSdkSqliteModule> | null = null;

function loadCursorSdk(): Promise<CursorSdkModule> {
  enableSdkCompileCache();
  loadedSdk ??= import(
    resolvePinnedSdkEntry({
      packageName: SDK_PACKAGE,
      version: SDK_VERSION,
      entryRelPath: SDK_ENTRY_RELPATH,
    })
  ).then(
    (mod: CursorSdkModule) => {
      flushSdkCompileCache();
      return mod;
    },
    (error: Error) => {
      loadedSdk = null;
      throw error;
    },
  );
  return loadedSdk;
}

function loadCursorSdkSqlite(): Promise<CursorSdkSqliteModule> {
  enableSdkCompileCache();
  loadedSdkSqlite ??= import(
    resolvePinnedSdkEntry({
      packageName: SDK_PACKAGE,
      version: SDK_VERSION,
      entryRelPath: SDK_SQLITE_ENTRY_RELPATH,
    })
  ).then(
    (mod: CursorSdkSqliteModule) => {
      flushSdkCompileCache();
      return mod;
    },
    (error: Error) => {
      loadedSdkSqlite = null;
      throw error;
    },
  );
  return loadedSdkSqlite;
}

/**
 * Starts both SDK imports (~0.45s measured) so they overlap the turn worker's
 * preflight and token round trips. Failures resurface at the real await in
 * `runCursorSdkAttempt`.
 */
export function preloadCursorSdk(): void {
  try {
    loadCursorSdk().catch(() => undefined);
    loadCursorSdkSqlite().catch(() => undefined);
  } catch {
  }
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

type CursorModelResolution = {
  selection: SdkModelSelection;
  catalog: string | null;
};

const CURSOR_MODEL_RESOLUTION_CACHE_FILE =
  CURSOR_RUNTIME_HOME_DIR + "/model-resolution.json";
const CURSOR_MODEL_RESOLUTION_MAX_AGE_MS = 60 * 60 * 1000;

function cursorModelResolutionKey(): string {
  return [
    normalizedCursorModel,
    cursorReasoningLevel,
    String(cursorFastMode),
    String(cursorUse1mContext),
  ].join("|");
}

function readCachedCursorModelResolution(): CursorModelResolution | null {
  try {
    const ageMs =
      Date.now() - statSync(CURSOR_MODEL_RESOLUTION_CACHE_FILE).mtimeMs;
    if (ageMs > CURSOR_MODEL_RESOLUTION_MAX_AGE_MS) return null;
    const cached: JsonLike = JSON.parse(
      readFileSync(CURSOR_MODEL_RESOLUTION_CACHE_FILE, "utf8"),
    );
    if (!isJsonObject(cached)) {
      return null;
    }
    const selection = cached.selection;
    if (
      cached.key !== cursorModelResolutionKey() ||
      typeof cached.catalog !== "string" ||
      !selection ||
      typeof selection !== "object" ||
      Array.isArray(selection) ||
      typeof selection.id !== "string"
    ) {
      return null;
    }
    const params: SdkModelParameterValue[] = [];
    for (const param of Array.isArray(selection.params)
      ? selection.params
      : []) {
      if (!isJsonObject(param)) continue;
      if (typeof param.id !== "string" || typeof param.value !== "string") {
        continue;
      }
      params.push({ id: param.id, value: param.value });
    }
    return {
      selection:
        params.length > 0 ? { id: selection.id, params } : { id: selection.id },
      catalog: cached.catalog,
    };
  } catch {
    return null;
  }
}

function writeCachedCursorModelResolution(
  resolution: CursorModelResolution,
): void {
  try {
    mkdirSync(CURSOR_RUNTIME_HOME_DIR, { recursive: true });
    const tmpFile =
      CURSOR_MODEL_RESOLUTION_CACHE_FILE + "." + String(process.pid);
    writeFileSync(
      tmpFile,
      JSON.stringify({ key: cursorModelResolutionKey(), ...resolution }),
    );
    renameSync(tmpFile, CURSOR_MODEL_RESOLUTION_CACHE_FILE);
  } catch (error) {
    log(
      "resolveCursorModelSelection: cache write failed (" +
        (error instanceof Error ? error.message : String(error)) +
        ")",
    );
  }
}

async function resolveCursorModelSelection(
  sdk: CursorSdkModule,
): Promise<SdkModelSelection> {
  const cached = readCachedCursorModelResolution();
  const resolution = cached ?? (await fetchCursorModelSelection(sdk));
  if (cached) {
    void fetchCursorModelSelection(sdk).catch(() => undefined);
  }
  if (resolution.catalog) {
    process.env[CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV] = resolution.catalog;
  }
  return resolution.selection;
}

async function fetchCursorModelSelection(
  sdk: CursorSdkModule,
): Promise<CursorModelResolution> {
  const base = normalizedCursorModel;
  let models: SdkModel[] | null = null;
  try {
    const list = sdk.Cursor?.models?.list;
    if (list) {
      const listed = await waitForCursorPhase({
        task: list(),
        phase: "fetching the model list",
        timeoutMs: CURSOR_AGENT_SETUP_TIMEOUT_MS,
      });
      if (Array.isArray(listed)) models = listed;
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    log(
      "resolveCursorModelSelection: model list failed — keeping opted-in params only (" +
        messageText +
        ")",
    );
  }
  const model = models?.find(
    (entry) => entry && typeof entry === "object" && entry.id === base,
  );
  if (models && !model) {
    log(
      "resolveCursorModelSelection: model " +
        base +
        " not in Cursor.models.list — keeping opted-in params only",
    );
  }
  const catalog = models ? cursorModelCatalogJson(models) : null;
  const selection = selectCursorModel(model);
  if (catalog && model) {
    writeCachedCursorModelResolution({ selection, catalog });
  }
  return { selection, catalog };
}

function selectCursorModel(model: SdkModel | undefined): SdkModelSelection {
  const base = normalizedCursorModel;
  const level = cursorReasoningLevel;
  const candidates = cursorModeParams(base, cursorFastMode, cursorUse1mContext);
  const opted = { fastMode: cursorFastMode, use1mContext: cursorUse1mContext };
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
  if (!level || !model) {
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
  costUsd?: number;
};

/**
 * Cost the Cursor backend has billed an agent, normalized from `getUsage()`.
 * `null` cost means "not reported (yet)", which is distinct from a reported 0
 * (request-priced, plan-included and BYOK usage all bill 0 raw cents).
 */
export type CursorCostSnapshot = {
  totalRawCents: number | null;
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
}): Promise<number | undefined> {
  if (!deps.before) return undefined;
  for (let attempt = 0; ; attempt++) {
    const after = await deps.fetchAfter();
    const rawCents = after
      ? attributeCursorTurnRawCents(deps.before, after)
      : null;
    if (rawCents !== null) {
      return Math.round((rawCents / 100) * 1e6) / 1e6;
    }
    const delayMs = COST_LOOKUP_RETRY_DELAYS_MS[attempt];
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
  promptText?: string;
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
  beginSdkAttempt("runCursorSdkAttempt", sessionMode, () =>
    cursorAgentStartupActivity(sessionMode),
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

  const cancelRun = (): void => {
    if (!activeRun) return;
    activeRun.cancel().catch(() => {
    });
  };

  const sdk = await loadCursorSdk();
  const sqlite = await loadCursorSdkSqlite();
  mkdirSync(CURSOR_SDK_STORE_DIR, { recursive: true });
  const store = await sqlite.SqliteLocalAgentStore.open({
    workspaceRef: AGENT_CWD,
    stateRoot: CURSOR_SDK_STORE_DIR,
  });
  const options: SdkAgentOptions = {
    apiKey: (process.env.CURSOR_API_KEY || "").trim(),
    model: await resolveCursorModelSelection(sdk),
    local: { cwd: AGENT_CWD, store },
    ...(Object.keys(evaMcpServers).length > 0
      ? { mcpServers: evaMcpServers }
      : {}),
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

  const combinedPrompt = withSystemPrompt(
    overrides.promptText ?? readTurnPrompt(),
  );

  const healthTimer = setInterval(() => {
    const now = Date.now();
    if (now - S.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS) {
      timedOutForMaxRuntime = true;
      log("runCursorSdkAttempt: max runtime exceeded — cancelling run");
      cancelRun();
      return;
    }
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
    const costBefore = agentIsFresh
      ? Promise.resolve(EMPTY_CURSOR_COST_SNAPSHOT)
      : readCostSnapshot(activeAgent);
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
    updateThinkingStep("Waiting for Grok...", "The model is thinking...");
    const messages = run.stream()[Symbol.asyncIterator]();
    let sawVisibleActivity = false;
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
      if (timedOutForMaxRuntime || timedOutForNoOutput) break;
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
        aborted: () => timedOutForMaxRuntime || timedOutForNoOutput,
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

  const resetForRecovery = (failedAgent: SdkAgent): void => {
    try {
      failedAgent.close();
    } catch {
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
    }
    try {
      await store.dispose();
    } catch {
    }
  }

  return finishSdkAttempt({
    name: "runCursorSdkAttempt",
    sawResult,
    resultIsError,
    timedOutForNoOutput,
    timedOutForMaxRuntime,
    output: attemptOutput,
    errorLabel: "runError",
    errorMessage: attemptErrorMessage,
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
