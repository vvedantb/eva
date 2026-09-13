import { readFileSync } from "fs";
import {
  MAX_TOTAL_RUNTIME_MS,
  NO_OUTPUT_CHECK_INTERVAL_MS,
  NO_OUTPUT_TIMEOUT_MS,
  SYSTEM_PROMPT,
  WORK_DIR,
  normalizedOpencodeModel,
} from "../config.js";
import { evaMcpServers } from "../evaMcp.js";
import { updateThinkingStep } from "../parse/canonical.js";
import { emitParsedStreamLine } from "../parse/streamRouter.js";
import {
  appendToRawLogFile,
  recordSdkAttemptFailure,
  recordSdkRetry,
  trimBufferHead,
} from "../runtime/buffers.js";
import { callbackState as S, resetAttemptState } from "../runtime/state.js";
import {
  syncOpencodeStateToPersist,
  writeOpencodeSessionState,
} from "../session/opencodeSession.js";
import type { ProviderAttemptResult, SessionMode } from "../types.js";
import { log } from "../utils.js";
import { buildStandardSdkAttemptResult } from "./attemptResult.js";
import { resolvePinnedSdkEntry } from "./claudeSdk.js";
import {
  ensureOpencodeServer,
  readOpencodeServerLogTail,
} from "./opencodeServer.js";
import type {
  OpencodeAssistantMessage,
  OpencodeClientLike,
  OpencodeEvent,
  OpencodeNamedError,
  OpencodePart,
  OpencodeResult,
  OpencodeSdkModule,
} from "./opencodeSdkTypes.js";

const SDK_PACKAGE = "@opencode-ai/sdk";
/**
 * Kept in lockstep with OPENCODE_VERSION in `convex/snapshotActions.ts`: the
 * SDK is a generated client for one server release, and npm has shipped a
 * launcher with no matching platform package before (1.18.17).
 */
const SDK_VERSION = "1.18.16";
/** ESM entry for the client half only — `dist/index.js` also pulls in the
 * server spawner (and its cross-spawn dep), which we never use. */
const SDK_ENTRY_RELPATH = "/dist/client.js";

/** Poll the server for turn completion once the event stream goes this quiet. */
const IDLE_PROBE_AFTER_MS = 60_000;
/** Minimum spacing between status polls while the stream stays quiet. */
const IDLE_PROBE_INTERVAL_MS = 15_000;
/** Consecutive idle status polls required before declaring the turn over. */
const IDLE_PROBE_STREAK = 2;

/**
 * Imports the opencode SDK version this adapter was generated against. The
 * client is generated for one server release, so a drifted global install is
 * worse than no install: see resolvePinnedSdkEntry.
 */
async function loadOpencodeSdk(): Promise<OpencodeSdkModule> {
  const mod: OpencodeSdkModule = await import(
    resolvePinnedSdkEntry({
      packageName: SDK_PACKAGE,
      version: SDK_VERSION,
      entryRelPath: SDK_ENTRY_RELPATH,
    })
  );
  return mod;
}

function readPromptText(): string {
  return readFileSync("/tmp/design-prompt.txt", "utf8");
}

/**
 * Eva's opencode slugs are `<providerID>/<modelID>` (openai/gpt-5.3-codex) —
 * the shape the CLI took after `--model`. The HTTP API wants the halves apart.
 * An unsplittable value yields an empty providerID and the caller omits `model`
 * from the request, letting the server fall back to its configured default
 * rather than failing the turn outright on a malformed id.
 */
export function splitOpencodeModel(raw: string): {
  providerID: string;
  modelID: string;
} {
  const separator = raw.indexOf("/");
  if (separator <= 0 || separator === raw.length - 1) {
    return { providerID: "", modelID: raw };
  }
  return {
    providerID: raw.slice(0, separator),
    modelID: raw.slice(separator + 1),
  };
}

/**
 * Per-turn bookkeeping for turning cumulative SSE parts into the incremental
 * JSONL the CLI used to print.
 */
export type PartEmitState = {
  /** Text/reasoning characters already forwarded, per part id. */
  emittedTextLength: Map<string, number>;
  /** Last tool status forwarded, per part id. */
  emittedToolStatus: Map<string, string>;
};

export function createPartEmitState(): PartEmitState {
  return { emittedTextLength: new Map(), emittedToolStatus: new Map() };
}

/**
 * Translates one opencode SSE part into the CLI's `--format json` line shape.
 *
 * Rather than teach `opencodeParseLine`, `opencodeToolToStep` and
 * `probeOpencodeStateResult` a second wire format, the runner reshapes SSE
 * parts into the `{type, part, sessionID}` lines they already understand — so
 * the parser and its fixtures survive the migration untouched. The shapes line
 * up because both transports serialize the same server types: a tool part's
 * `state.{status,input,output,metadata,time}` is identical on each.
 *
 * Returns null when a part yields no line: an unhandled kind, a repeated tool
 * status, or a text update carrying no new characters.
 */
export function opencodePartToCliLine(
  part: OpencodePart,
  state: PartEmitState,
): string | null {
  if (part.type === "text" || part.type === "reasoning") {
    // Text and reasoning parts are cumulative on the wire while the canonical
    // layer appends; forward only what was added since the last update.
    const emitted = state.emittedTextLength.get(part.id) ?? 0;
    if (part.text.length <= emitted) return null;
    const delta = part.text.slice(emitted);
    state.emittedTextLength.set(part.id, part.text.length);
    return JSON.stringify({
      type: part.type,
      part: { ...part, text: delta },
      sessionID: part.sessionID,
    });
  }
  if (part.type === "tool") {
    // A tool part is re-sent on every mutation; emit once per status so the
    // parser pushes one step and completes it exactly once.
    if (state.emittedToolStatus.get(part.id) === part.state.status) return null;
    state.emittedToolStatus.set(part.id, part.state.status);
    return JSON.stringify({
      type: "tool_use",
      part,
      sessionID: part.sessionID,
    });
  }
  if (part.type === "step-start" || part.type === "step-finish") {
    return JSON.stringify({
      type: part.type === "step-start" ? "step_start" : "step_finish",
      part,
      sessionID: part.sessionID,
    });
  }
  return null;
}

/** Session id an event belongs to, across the event union's differing shapes. */
export function opencodeEventSessionId(event: OpencodeEvent): string {
  const properties = event.properties;
  if (!properties) return "";
  return (
    properties.part?.sessionID ??
    properties.info?.sessionID ??
    properties.sessionID ??
    ""
  );
}

/** Human-readable message for a terminal opencode error. */
export function opencodeErrorMessage(
  error: OpencodeNamedError | undefined,
): string {
  if (!error) return "";
  return error.data?.message || error.name || "Opencode error";
}

export type TurnUsage = {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
};

const ZERO_USAGE: TurnUsage = {
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  model: "",
};

/**
 * Final usage for the turn, straight off the assistant message the server
 * settled on. Reasoning folds into output tokens, matching how the CLI path
 * reported them (and how Eva prices a turn).
 */
export function readTurnUsage(info: OpencodeAssistantMessage): TurnUsage {
  return {
    costUsd: info.cost,
    inputTokens: info.tokens.input,
    outputTokens: info.tokens.output + info.tokens.reasoning,
    cacheReadTokens: info.tokens.cache.read,
    cacheWriteTokens: info.tokens.cache.write,
    model: info.modelID,
  };
}

/** Concatenated assistant prose — the turn's user-visible result text. */
function readMessageText(parts: OpencodePart[]): string {
  let text = "";
  for (const part of parts) {
    if (part.type === "text") text += part.text;
  }
  return text;
}

/** Describes a non-2xx envelope using whatever detail the server returned. */
function resultFailure<TData>(result: OpencodeResult<TData>): string {
  return (
    opencodeErrorMessage(result.error) ||
    (result.response ? "HTTP " + String(result.response.status) : "no data")
  );
}

/**
 * Registers Eva's HTTP MCP server on the shared `opencode serve` process.
 *
 * opencode reads its `mcp` config once at server startup, and that server
 * outlives the callback (one per sandbox, reused by every turn), so a config
 * file would leave any already-running server without the tools. `POST /mcp`
 * registers the same descriptor on the live instance instead, and is skipped as
 * soon as the server reports the entry.
 *
 * Best-effort: a server Eva cannot register costs the turn its Eva tools, which
 * beats failing a turn that would otherwise run.
 */
export async function ensureEvaMcpServers(
  client: Pick<OpencodeClientLike, "mcp">,
  servers = evaMcpServers,
): Promise<void> {
  const configured = Object.entries(servers);
  if (configured.length === 0) return;
  try {
    const status = await client.mcp.status();
    if (!status.data) {
      log("opencode mcp.status failed: " + resultFailure(status));
      return;
    }
    for (const [name, server] of configured) {
      if (status.data[name]) continue;
      const added = await client.mcp.add({
        body: {
          name,
          config: {
            type: "remote",
            url: server.url,
            headers: server.headers,
            enabled: true,
          },
        },
      });
      log(
        added.data
          ? "opencode mcp server " +
              name +
              " registered (" +
              (added.data[name]?.status ?? "unknown") +
              ")"
          : "opencode mcp.add " + name + " failed: " + resultFailure(added),
      );
    }
  } catch (error) {
    log(
      "opencode mcp registration failed: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

/** Turns a non-2xx envelope into a thrown error with the server's message. */
function requireData<TData>(
  result: OpencodeResult<TData>,
  what: string,
): TData {
  if (result.data === undefined) {
    throw new Error("opencode " + what + " failed: " + resultFailure(result));
  }
  return result.data;
}

/**
 * Runs one OpenCode turn against the sandbox's `opencode serve` process.
 *
 * Shape mirrors runCursorSdkAttempt: SSE events are reshaped into the CLI's
 * JSONL lines and pushed through the realtime pipeline
 * (processRealtimeStdoutChunk -> opencodeParseLine -> canonical events), so
 * streaming, activity tracking and session persistence keep the existing
 * plumbing. The turn result is synthesized as a final `{type:"result"}` line
 * from the settled assistant message, which is why completion.ts no longer
 * reparses the whole stdout buffer for opencode.
 *
 * The prompt goes out via `promptAsync` rather than the blocking `prompt`
 * deliberately: a blocking prompt holds one HTTP response open for the whole
 * turn, and Node's undici default headersTimeout (300s) would abort any turn
 * running longer than five minutes.
 */
export async function runOpencodeSdkAttempt(
  sessionMode: SessionMode,
): Promise<ProviderAttemptResult> {
  resetAttemptState();
  S.activeAttemptStartedAt = Date.now();
  updateThinkingStep(
    "Starting Opencode agent...",
    sessionMode.mode === "resume"
      ? "Restoring saved context..."
      : "Creating Opencode session...",
  );
  log(
    "runOpencodeSdkAttempt started (mode=" +
      sessionMode.mode +
      ", sessionId=" +
      (sessionMode.sessionId || "none") +
      ")",
  );

  let attemptOutput = "";
  // Two clocks, deliberately: `lastEventAt` counts real stream silence and
  // drives the idle probe, while `watchdogClock` is also refreshed by in-flight
  // tools so a long silent tool is never killed. Sharing one would make the
  // tool exemption suppress the very probe that recovers a dropped stream
  // during that tool.
  let lastEventAt = Date.now();
  let watchdogClock = Date.now();
  let timedOutForNoOutput = false;
  let timedOutForMaxRuntime = false;
  let sawResult = false;
  let resultIsError = false;
  let attemptErrorMessage = "";

  const sdk = await loadOpencodeSdk();
  const baseUrl = await ensureOpencodeServer();
  const client: OpencodeClientLike = sdk.createOpencodeClient({
    baseUrl,
    directory: WORK_DIR,
  });
  await ensureEvaMcpServers(client);

  const persistSessionId = (sessionId: string): void => {
    S.activeOpencodeSessionId = sessionId;
    writeOpencodeSessionState();
    syncOpencodeStateToPersist();
  };

  const createFreshSession = async (): Promise<string> => {
    const created = requireData(
      await client.session.create(),
      "session.create",
    );
    if (created.version !== SDK_VERSION) {
      log(
        "opencode server version " +
          created.version +
          " differs from the SDK pin " +
          SDK_VERSION,
      );
    }
    persistSessionId(created.id);
    return created.id;
  };

  // Resume self-heal (the CLI passed `-s <id>` blind): a session id from before
  // this migration, or one lost with a wiped runtime home, is unknown to the
  // server. Degrade to a single fresh session — one context reset beats every
  // future turn in that chat failing.
  let sessionId = "";
  if (sessionMode.mode === "resume" && sessionMode.sessionId) {
    const existing = await client.session.get({
      path: { id: sessionMode.sessionId },
    });
    if (existing.data) {
      sessionId = existing.data.id;
      persistSessionId(sessionId);
    } else {
      log(
        "runOpencodeSdkAttempt: session " +
          sessionMode.sessionId +
          " unknown to the server — starting a fresh session",
      );
      recordSdkRetry("resume session not found: " + sessionMode.sessionId);
      sessionId = await createFreshSession();
    }
  } else {
    sessionId = await createFreshSession();
  }

  const promptText = readPromptText();
  const combinedPrompt = SYSTEM_PROMPT
    ? SYSTEM_PROMPT + "\n\n" + promptText
    : promptText;
  const model = splitOpencodeModel(normalizedOpencodeModel);

  const emitState = createPartEmitState();
  const streamAbort = new AbortController();
  let terminalReached = false;
  let resolveTerminal = (): void => {};
  const terminal = new Promise<void>((resolve) => {
    resolveTerminal = resolve;
  });
  const markTerminal = (): void => {
    if (terminalReached) return;
    terminalReached = true;
    resolveTerminal();
  };

  let assistantMessageId = "";
  let usage: TurnUsage = ZERO_USAGE;
  let turnErrorMessage = "";
  let sawSessionEvent = false;
  let idleProbeStreak = 0;
  let idleProbeInFlight = false;
  let lastIdleProbeAt = 0;

  const pushLine = (line: string): void => {
    emitParsedStreamLine(line);
    attemptOutput = trimBufferHead(attemptOutput + line);
  };

  const emitPart = (part: OpencodePart): void => {
    const line = opencodePartToCliLine(part, emitState);
    if (line) pushLine(line + "\n");
  };

  const abortTurn = (): void => {
    client.session.abort({ path: { id: sessionId } }).catch(() => {
      /* session already finished */
    });
    markTerminal();
  };

  /**
   * Recovery for events lost while the SSE connection was down. undici drops a
   * response body that goes 300s without bytes, so a long silent tool can end
   * the stream mid-turn; the SDK's SSE client reconnects within seconds, but
   * the server does not replay what was missed. If it reports the session idle
   * while we are still waiting, the turn really is over.
   *
   * Gated on having seen at least one event for this session: before the first
   * one we cannot distinguish "the server has not marked the session busy yet"
   * from "the turn finished", and concluding the latter would truncate a turn
   * whose model is simply slow to first token.
   */
  const probeSessionIdle = async (): Promise<void> => {
    if (idleProbeInFlight || terminalReached || !sawSessionEvent) return;
    idleProbeInFlight = true;
    lastIdleProbeAt = Date.now();
    try {
      const status = await client.session.status();
      if (!status.data) return;
      const sessionStatus = status.data[sessionId];
      const idle = !sessionStatus || sessionStatus.type === "idle";
      idleProbeStreak = idle ? idleProbeStreak + 1 : 0;
      if (idleProbeStreak >= IDLE_PROBE_STREAK) {
        log(
          "runOpencodeSdkAttempt: server reports the session idle after an event gap — finishing turn",
        );
        appendToRawLogFile(
          "[sdk-recover] session idle detected by status poll\n",
        );
        markTerminal();
      }
    } catch {
      /* transient probe failure — the watchdog remains the backstop */
    } finally {
      idleProbeInFlight = false;
    }
  };

  const healthTimer = setInterval(() => {
    const now = Date.now();
    // The turn is settled but the interval outlives it until `finally` clears
    // it — the final message fetch still runs in between, and firing a timeout
    // there would flip a successful turn to a failure.
    if (terminalReached) return;
    if (S.fatalHeartbeatErrorMessage) {
      attemptErrorMessage = S.fatalHeartbeatErrorMessage;
      abortTurn();
      return;
    }
    if (now - S.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS) {
      timedOutForMaxRuntime = true;
      log("runOpencodeSdkAttempt: max runtime exceeded — aborting turn");
      abortTurn();
      return;
    }
    // No events arrive between a tool's running and completed updates, so a
    // long silent tool (10-minute bash, subagent run) is indistinguishable from
    // a hang by event silence alone: while a tool is in flight only the hard
    // runtime cap applies.
    if (S.inFlightToolUses > 0) {
      watchdogClock = now;
    }
    if (
      now - lastEventAt > IDLE_PROBE_AFTER_MS &&
      now - lastIdleProbeAt > IDLE_PROBE_INTERVAL_MS
    ) {
      void probeSessionIdle();
    }
    if (now - watchdogClock > NO_OUTPUT_TIMEOUT_MS * 5) {
      timedOutForNoOutput = true;
      log("runOpencodeSdkAttempt: no SDK events — aborting turn");
      abortTurn();
    }
  }, NO_OUTPUT_CHECK_INTERVAL_MS);

  const consumeEvents = async (
    stream: AsyncIterable<OpencodeEvent>,
  ): Promise<void> => {
    for await (const event of stream) {
      if (terminalReached) break;
      if (opencodeEventSessionId(event) !== sessionId) continue;
      lastEventAt = Date.now();
      watchdogClock = lastEventAt;
      sawSessionEvent = true;
      idleProbeStreak = 0;
      const part = event.properties?.part;
      if (event.type === "message.part.updated" && part) {
        emitPart(part);
        continue;
      }
      const info = event.properties?.info;
      if (event.type === "message.updated" && info?.role === "assistant") {
        assistantMessageId = info.id;
        usage = readTurnUsage(info);
        if (info.error) turnErrorMessage = opencodeErrorMessage(info.error);
        continue;
      }
      if (event.type === "session.error") {
        turnErrorMessage = opencodeErrorMessage(event.properties?.error);
        continue;
      }
      if (event.type === "session.idle") {
        markTerminal();
        break;
      }
    }
  };

  try {
    // Subscribe before prompting: the server has no event replay, so a
    // subscription opened after the prompt loses the turn's opening events.
    const events = await client.event.subscribe({ signal: streamAbort.signal });
    const consumed = consumeEvents(events.stream);
    consumed.catch(() => {
      /* surfaced by the terminal race below */
    });

    // promptAsync answers 204 with no body, so acceptance is the absence of an
    // error rather than the presence of data. Without this check a rejected
    // prompt (bad model id, deleted session) would silently wait for events
    // that never come.
    const accepted = await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        ...(model.providerID ? { model } : {}),
        parts: [{ type: "text", text: combinedPrompt }],
      },
    });
    if (accepted.error || accepted.response?.ok === false) {
      throw new Error(
        "opencode session.promptAsync failed: " + resultFailure(accepted),
      );
    }
    // Both clocks start from prompt acceptance, not from server-manager setup:
    // a cold `opencode serve` start must not eat into the turn's silence budget.
    lastEventAt = Date.now();
    watchdogClock = lastEventAt;

    await Promise.race([terminal, consumed]);
    markTerminal();

    // Authoritative final state, independent of anything an SSE reconnect
    // dropped: re-read the settled assistant message, replay parts the stream
    // never delivered (the emit dedupe keeps already-sent ones out), and take
    // usage and result text from it.
    const finalMessage = assistantMessageId
      ? await client.session.message({
          path: { id: sessionId, messageID: assistantMessageId },
        })
      : null;
    let resultText = "";
    const finalData = finalMessage?.data;
    if (finalData && finalData.info.role === "assistant") {
      for (const part of finalData.parts) emitPart(part);
      usage = readTurnUsage(finalData.info);
      if (finalData.info.error) {
        turnErrorMessage = opencodeErrorMessage(finalData.info.error);
      }
      resultText = readMessageText(finalData.parts);
    }

    resultIsError = Boolean(turnErrorMessage);
    pushLine(
      JSON.stringify({
        type: "result",
        is_error: resultIsError,
        result: resultText || turnErrorMessage,
        duration_ms: Date.now() - S.activeAttemptStartedAt,
        total_cost_usd: usage.costUsd,
        model: usage.model || normalizedOpencodeModel,
        usage: {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_read_input_tokens: usage.cacheReadTokens,
          cache_creation_input_tokens: usage.cacheWriteTokens,
        },
      }) + "\n",
    );
    sawResult = true;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    attemptErrorMessage = messageText;
    log("runOpencodeSdkAttempt: turn failed — " + messageText);
    recordSdkAttemptFailure(messageText, {
      extraStderr: readOpencodeServerLogTail(1_000),
    });
  } finally {
    clearInterval(healthTimer);
    markTerminal();
    streamAbort.abort();
  }

  const code =
    sawResult &&
    !resultIsError &&
    !timedOutForMaxRuntime &&
    !timedOutForNoOutput
      ? 0
      : 1;
  log(
    "runOpencodeSdkAttempt finished in " +
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
      (attemptErrorMessage ? ", turnError=" + attemptErrorMessage : "") +
      ")",
  );
  return buildStandardSdkAttemptResult({
    code,
    output: attemptOutput,
    timedOutForNoOutput,
    timedOutForMaxRuntime,
  });
}
