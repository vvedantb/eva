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
} from "./config.js";
import { hasEvaMcpConfig } from "./evaMcp.js";
import { runSdkDaemon } from "./providers/claudeSdkDaemon.js";
import { runCodexAppServerDaemon } from "./providers/codexAppServerDaemon.js";
import {
  runCursorDaemon,
  runCursorTurnWorker,
} from "./providers/cursorSdkDaemon.js";
import { ensureGithubToken } from "./providers/githubToken.js";
import { callbackState as S } from "./runtime/state.js";
import {
  appendCurrentTurnLease,
  endTurnOwnership,
} from "./runtime/turnLease.js";
import { waitForPendingClaudeUsageReport } from "./runtime/usageLimits.js";
import { persistTurnWork } from "./runtime/turnPersist.js";
import { beginTurnCheckpoint } from "./runtime/turnCheckpoint.js";
import { materializeSystemSkills } from "./runtime/systemSkills.js";
import { startBranchWatcher } from "./runtime/branchWatcher.js";
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
  sendTurnCompletion,
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
import { serializeFinalSteps, serializeSteps } from "./parse/stepBudget.js";

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
  }
});

try {
  unlinkSync(READY_FILE);
} catch {
}

writeOomScoreAdj("self", "-600");

S.lastStepType = "thinking";

materializeSystemSkills();

startBranchWatcher();

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

for (const d of [WORK_DIR + "/screenshots", WORK_DIR + "/recordings"]) {
  try {
    mkdirSync(d, { recursive: true });
  } catch {
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
    (hasEvaMcpConfig ? "yes" : "no"),
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
  const agentWasInterrupted = providerAttemptWasInterrupted(finalAttempt);
  const attemptEndedDueToTimeout = providerAttemptTimedOut(finalAttempt);
  const { success: runSucceededWithResult, error: resolvedError } =
    resolveProviderAttemptOutcome(finalAttempt, finalResultEvent);
  let errorValue: string | null = resolvedError;

  for (const step of S.accumulatedSteps) step.status = "complete";
  const activityLog = serializeFinalSteps(
    S.accumulatedSteps,
    finalResultEvent?.result ?? "",
  );

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
  try {
    await sendTurnCompletion(COMPLETION_MUTATION ?? "", errorArgs);
  } catch {
  }
  process.exit(1);
}

void SCRIPT_STARTED_AT;
