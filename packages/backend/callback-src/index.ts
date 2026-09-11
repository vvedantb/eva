import { mkdirSync, unlinkSync } from "fs";
import {
  ALLOWED_TOOLS,
  CLAIM_MUTATION,
  COMPLETION_MUTATION,
  CONVEX_TOKEN,
  CONVEX_URL,
  ENTITY_ID,
  ENTITY_ID_FIELD,
  IS_CURSOR_TURN_WORKER,
  MODEL,
  PROVIDER,
  READY_FILE,
  REPO_ID,
  REQUIRE_TASK_COMMIT,
  RUN_ID,
  SCRIPT_STARTED_AT,
  WORK_DIR,
  hasMcpConfig,
} from "./config.js";
import { runSdkDaemon } from "./providers/claudeSdkDaemon.js";
import { runCodexAppServerDaemon } from "./providers/codexAppServerDaemon.js";
import {
  runCursorDaemon,
  runCursorTurnWorker,
} from "./providers/cursorSdkDaemon.js";
import { callConvexWithRetry } from "./http/convexClient.js";
import { ensureGithubToken } from "./providers/githubToken.js";
import { callbackState as S } from "./runtime/state.js";
import {
  appendCurrentTurnLease,
  endTurnOwnership,
} from "./runtime/turnLease.js";
import { waitForPendingClaudeUsageReport } from "./runtime/usageLimits.js";
import { persistTurnWork } from "./runtime/turnPersist.js";
import {
  appendTurnCheckpoint,
  beginTurnCheckpoint,
} from "./runtime/turnCheckpoint.js";
import { materializeSystemSkills } from "./runtime/systemSkills.js";
import {
  flushStreaming,
  runPreflightHeartbeat,
  setFinalizingState,
  startStreamingLoops,
  stopStreamingLoops,
} from "./runtime/heartbeats.js";
import {
  appendDiagnosticTail,
  buildTurnCompletionPayload,
  deliverCompletionWithMedia,
  extractResultEvent,
  hasToolActivity,
  providerAttemptTimedOut,
  providerAttemptWasInterrupted,
  resolveProviderAttemptOutcome,
  writeDoneFile,
} from "./runtime/completion.js";
import {
  prepareProviderSessionState,
  runProviderAttempt,
  syncProviderStateToPersist,
} from "./providers/attempts.js";
import type { JsonObject } from "./types.js";
import { hasNewTaskCommitSince, log, readGitHeadSha } from "./utils.js";
import { writeOomScoreAdj } from "./runtime/daemonProcess.js";
import { serializeSteps } from "./parse/stepBudget.js";

// Cursor chat turns run in disposable children so the SDK cannot retain heap
// across messages. The lightweight parent daemon remains alive to claim turns
// and process cancellation. Enter the worker before touching the parent's ready
// marker or installing its process-exit bookkeeping.
if (IS_CURSOR_TURN_WORKER) {
  try {
    await runCursorTurnWorker();
    process.exit(0);
  } catch (error) {
    log(
      "cursor turn worker failed: " +
        (error instanceof Error ? error.message : String(error)),
    );
    process.exit(1);
  }
}

process.on("exit", (code) => {
  writeDoneFile("unexpected-exit", {
    exitCode: typeof code === "number" ? code : null,
  });
  try {
    if (S.rawLogStream) S.rawLogStream.end();
  } catch {
    /* ignore */
  }
});

try {
  unlinkSync(READY_FILE);
} catch {
  /* ignore */
}

// Bias the kernel OOM killer away from this callback. If the sandbox runs out
// of memory during a heavy tool step (e.g. `npx tsc`), the agent subtree should
// die — not the process responsible for heartbeats and failure reporting.
// Lowering our own score requires privilege, so this is best-effort; a spawned
// child's score is raised at spawn time (opencodeServer.ts) as the portable half.
writeOomScoreAdj("self", "-600");

S.lastStepType = "thinking";

// Before either provider path starts — the agent scans `.agents/skills` on
// startup, so installed Eva skills must already be on disk.
materializeSystemSkills();

// Interactive chats keep one provider process warm and claim staged turns.
// Jobs (tasks / automations / arena) omit CLAIM_MUTATION and stay one-shot.
if (CLAIM_MUTATION) {
  if (PROVIDER === "claude") {
    await runSdkDaemon();
  }
  if (PROVIDER === "codex") {
    await runCodexAppServerDaemon();
  }
  if (PROVIDER === "cursor") {
    await runCursorDaemon();
  }
}

const preflightOk = await runPreflightHeartbeat();

if (!preflightOk) {
  writeDoneFile("preflight-failed");
  process.exit(1);
}

startStreamingLoops();

// Deliverable folders are not cleared at startup: the end-of-turn harvest
// archives posted files into `.posted/`, so any top-level leftovers are
// failed uploads from a crashed turn — this turn's harvest posts them.
for (const d of [WORK_DIR + "/screenshots", WORK_DIR + "/recordings"]) {
  try {
    mkdirSync(d, { recursive: true });
  } catch {
    /* ignore */
  }
}

await ensureGithubToken({
  convexUrl: CONVEX_URL,
  convexToken: CONVEX_TOKEN,
  repoId: REPO_ID,
});

log(
  "entityId=" +
    ENTITY_ID +
    " provider=" +
    PROVIDER +
    " model=" +
    MODEL +
    " tools=" +
    ALLOWED_TOOLS +
    " sessionId=" +
    (process.env.CLAUDE_SESSION_ID || "none") +
    " mcp=" +
    (hasMcpConfig ? "yes" : "no"),
);

try {
  beginTurnCheckpoint();
  const taskCommitBaselineHead = REQUIRE_TASK_COMMIT ? readGitHeadSha() : "";
  if (REQUIRE_TASK_COMMIT) {
    log(
      "task commit gate enabled baselineHead=" +
        (taskCommitBaselineHead || "unavailable"),
    );
  }

  const initialSessionMode = prepareProviderSessionState();
  const firstAttempt = await runProviderAttempt(initialSessionMode);
  await flushStreaming();

  let finalCode = firstAttempt.code;
  let finalTimedOutForNoOutput = Boolean(firstAttempt.timedOutForNoOutput);
  let finalTimedOutForMaxRuntime = Boolean(firstAttempt.timedOutForMaxRuntime);
  let finalTimedOutForFirstEvent = Boolean(firstAttempt.timedOutForFirstEvent);
  let finalTimedOutForFirstAssistant = Boolean(
    firstAttempt.timedOutForFirstAssistant,
  );
  let finalTimedOutAfterFirstText = Boolean(
    firstAttempt.timedOutAfterFirstText,
  );
  let finalTimedOutForZombie = Boolean(firstAttempt.timedOutForZombie);
  const finalTerminatedBySignal = firstAttempt.terminatedBySignal;
  const finalToolStallErrorMessage = firstAttempt.toolStallErrorMessage || "";
  let finalResultEvent = extractResultEvent(firstAttempt.output);
  log(
    "firstAttempt result: code=" +
      firstAttempt.code +
      " isError=" +
      Boolean(finalResultEvent?.isError) +
      " hasToolActivity=" +
      hasToolActivity(),
  );

  if (!S.resultEventSeen) {
    syncProviderStateToPersist("post-attempt");
  } else {
    log("skipping post-attempt sync because result-event sync already ran");
  }

  if (await setFinalizingState()) process.exit(0);

  const finalAttempt = {
    code: finalCode,
    terminatedBySignal: finalTerminatedBySignal,
    output: firstAttempt.output,
    timedOutForNoOutput: finalTimedOutForNoOutput,
    timedOutForMaxRuntime: finalTimedOutForMaxRuntime,
    timedOutForFirstEvent: finalTimedOutForFirstEvent,
    timedOutForFirstAssistant: finalTimedOutForFirstAssistant,
    timedOutAfterFirstText: finalTimedOutAfterFirstText,
    timedOutForZombie: finalTimedOutForZombie,
    toolStallErrorMessage: finalToolStallErrorMessage,
  };
  // Cursor can flush partial assistant text while a SIGTERM/SIGKILL is tearing
  // down the process. extractResultEvent deliberately falls back to that text,
  // so without this guard an interrupted recording turn reported its
  // "recording now…" preamble as a successful final answer. Node reports a
  // direct signal with `code=null`; shells can translate it to 137/143. Keep
  // both forms so neither can masquerade as genuine completion.
  const agentWasInterrupted = providerAttemptWasInterrupted(finalAttempt);
  const attemptEndedDueToTimeout = providerAttemptTimedOut(finalAttempt);
  const { success: runSucceededWithResult, error: resolvedError } =
    resolveProviderAttemptOutcome(finalAttempt, finalResultEvent);
  let errorValue: string | null = resolvedError;

  // The final result text is delivered separately (rendered as the chat
  // message via `result`/`resultSummary`). If the last streamed "response"
  // step carries essentially the same text, drop it so the response isn't
  // shown twice. Trailing thinking steps are skipped when locating it (a
  // status step may have been pushed after the response). Intermediate
  // response steps (earlier turns before a tool call, etc.) are untouched.
  const finalResultText = (finalResultEvent?.result ?? "").trim();
  if (finalResultText) {
    let lastIdx = S.accumulatedSteps.length - 1;
    while (lastIdx >= 0 && S.accumulatedSteps[lastIdx].type === "thinking") {
      lastIdx--;
    }
    const candidate = lastIdx >= 0 ? S.accumulatedSteps[lastIdx] : undefined;
    if (candidate && candidate.type === "response") {
      const detail = (candidate.detail ?? "").trim();
      if (
        detail &&
        (finalResultText === detail ||
          finalResultText.startsWith(detail) ||
          detail.startsWith(finalResultText))
      ) {
        S.accumulatedSteps.splice(lastIdx, 1);
      }
    }
  }

  for (const step of S.accumulatedSteps) step.status = "complete";
  const activityLog = serializeSteps(S.accumulatedSteps);

  let completionSuccess = agentWasInterrupted
    ? false
    : finalResultEvent
      ? !finalResultEvent.isError
      : finalCode === 0;
  if (attemptEndedDueToTimeout && !runSucceededWithResult) {
    completionSuccess = false;
  }
  if (completionSuccess && REQUIRE_TASK_COMMIT) {
    if (!hasNewTaskCommitSince(taskCommitBaselineHead)) {
      completionSuccess = false;
      const commitGateMessage =
        "Agent finished without creating a new git commit. Edit the required files, run git add and git commit locally, then try again.";
      errorValue = errorValue
        ? errorValue + "\n\n" + commitGateMessage
        : commitGateMessage;
      log(
        "completion: rejected — no new commit (baseline=" +
          (taskCommitBaselineHead || "none") +
          " current=" +
          (readGitHeadSha() || "none") +
          ")",
      );
    }
  }
  log(
    "completion: success=" +
      completionSuccess +
      " code=" +
      finalCode +
      " hasResult=" +
      Boolean(finalResultEvent) +
      " error=" +
      (errorValue ? errorValue.slice(0, 200) : "none") +
      " steps=" +
      S.accumulatedSteps.length,
  );

  const completionArgs = buildTurnCompletionPayload({
    success: completionSuccess,
    result: finalResultEvent?.result ?? S.rawOutput,
    error: errorValue,
    activityLog,
    resultEvent: finalResultEvent,
    entityFieldFallback: "entityId",
  });
  appendCurrentTurnLease(completionArgs);

  // Durability BEFORE completion: commit + push the turn's work so a VM death
  // after this point cannot erase it (no-op for task runs — the commit gate
  // and the run workflow's own push steps own those semantics).
  persistTurnWork();

  try {
    await deliverCompletionWithMedia(completionArgs);
    endTurnOwnership();
    syncProviderStateToPersist("completion");
    await stopStreamingLoops();
    await waitForPendingClaudeUsageReport();
    writeDoneFile(completionSuccess ? "success" : "error", {
      exitCode: finalCode,
      error: errorValue,
    });
    // Hard-exit: a tool step can leave a background child holding our stdio
    // fds, which keeps the event loop alive forever. A lingering runner keeps
    // holding the per-entity spawn flock, so every later one-shot launch for
    // this entity loses the lock and the chat sticks on "Working…" (its
    // heartbeat also keeps fooling the stall watchdog's liveness probe).
    process.exit(0);
  } catch (e) {
    console.error("Failed to send completion:", e);
    syncProviderStateToPersist("completion-error");
    await stopStreamingLoops();
    writeDoneFile("completion-error", {
      exitCode: finalCode,
      error: e instanceof Error ? e.message : String(e),
    });
    process.exit(1);
  }
} catch (err) {
  // Durability BEFORE the failure completion, as the success path above does
  // it: this process is about to exit, so nothing else publishes what the turn
  // already committed. Best-effort — persistTurnWork logs and swallows every
  // git failure, so the completion below always posts.
  persistTurnWork();
  syncProviderStateToPersist("fatal-error");
  await stopStreamingLoops();
  writeDoneFile("fatal-error", {
    error: err instanceof Error ? err.message : String(err),
  });
  const errorArgs: JsonObject = {
    [ENTITY_ID_FIELD ?? "entityId"]: ENTITY_ID ?? "",
    success: false,
    result: null,
    error: appendDiagnosticTail(
      err instanceof Error
        ? err.message
        : "Failed to run " +
            (PROVIDER === "codex"
              ? "Codex SDK"
              : PROVIDER === "opencode"
                ? "Opencode CLI"
                : PROVIDER === "cursor"
                  ? "Cursor CLI"
                  : "Claude CLI"),
    ),
    activityLog: serializeSteps(S.accumulatedSteps),
  };
  if (RUN_ID) errorArgs.runId = RUN_ID;
  appendCurrentTurnLease(errorArgs);
  appendTurnCheckpoint(errorArgs);
  try {
    await callConvexWithRetry("mutation", COMPLETION_MUTATION ?? "", errorArgs);
  } catch {
    /* ignore completion error path failures */
  }
  process.exit(1);
}

void SCRIPT_STARTED_AT;
