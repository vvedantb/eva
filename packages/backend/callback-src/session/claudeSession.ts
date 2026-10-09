import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import {
  CLAUDE_LOCAL_PROJECT_DIR,
  CLAUDE_LOCAL_STATE_FILE,
  CLAUDE_PERSIST_DIR,
  CLAUDE_PERSIST_PROJECT_DIR,
  CLAUDE_PERSIST_STATE_FILE,
  CLAUDE_RUNTIME_CONFIG_DIR,
  WORK_DIR,
} from "../config.js";
import { updateThinkingStep } from "../parse/canonical.js";
import { callbackState as S } from "../runtime/state.js";
import type { SessionMode, StartupStep } from "../types.js";
import {
  buildClaudeTranscriptPath,
  copyBaseClaudeConfig,
  copyFileIfPresent,
  log,
  logTranscriptStats,
  runTimedBashSync,
  tryParseJsonObject,
} from "../utils.js";

/** Builds the startup progress step label and detail for the Claude CLI. */
export function buildClaudeStartupStep(): StartupStep {
  if (S.waitingForFirstAssistantEvent && S.claudeInitAt > 0) {
    const elapsedSeconds = Math.max(
      1,
      Math.floor((Date.now() - S.claudeInitAt) / 1000),
    );
    return S.activeClaudeSessionMode === "resume"
      ? {
          label: "Restoring Claude session...",
          detail:
            "Claude started. Restoring saved context... " +
            elapsedSeconds +
            "s",
        }
      : {
          label: "Starting Claude CLI...",
          detail:
            "Claude started. Waiting for first output... " +
            elapsedSeconds +
            "s",
        };
  }
  return S.activeClaudeSessionMode === "resume"
    ? {
        label: "Starting Claude CLI...",
        detail: "Launching Claude with saved session...",
      }
    : {
        label: "Starting Claude CLI...",
        detail: "Launching Claude process...",
      };
}

function readClaudeSessionState(): { resumeSessionId: string } | null {
  if (!existsSync(CLAUDE_LOCAL_STATE_FILE)) {
    return null;
  }
  const parsed = tryParseJsonObject(
    readFileSync(CLAUDE_LOCAL_STATE_FILE, "utf8"),
  );
  if (!parsed) return null;
  const resumeSessionId =
    typeof parsed.resumeSessionId === "string"
      ? parsed.resumeSessionId.trim()
      : "";
  if (!resumeSessionId) {
    return null;
  }
  return { resumeSessionId };
}

function writeClaudeSessionState(): void {
  if (!process.env.CLAUDE_SESSION_ID) {
    return;
  }
  const resumeSessionId =
    typeof S.activeClaudeSessionId === "string" &&
    S.activeClaudeSessionId.trim()
      ? S.activeClaudeSessionId.trim()
      : process.env.CLAUDE_SESSION_ID;
  if (!resumeSessionId) {
    return;
  }
  mkdirSync(CLAUDE_RUNTIME_CONFIG_DIR, { recursive: true });
  writeFileSync(
    CLAUDE_LOCAL_STATE_FILE,
    JSON.stringify(
      {
        logicalSessionId: process.env.CLAUDE_SESSION_ID,
        resumeSessionId,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function collectClaudeTranscriptSessionIds(): string[] {
  const sessionIds = new Set<string>();
  const configuredSessionId = process.env.CLAUDE_SESSION_ID;
  if (configuredSessionId) {
    sessionIds.add(configuredSessionId);
  }
  const persistedState = readClaudeSessionState();
  if (persistedState && persistedState.resumeSessionId) {
    sessionIds.add(persistedState.resumeSessionId);
  }
  const currentSessionId =
    typeof S.activeClaudeSessionId === "string"
      ? S.activeClaudeSessionId.trim()
      : "";
  if (currentSessionId) {
    sessionIds.add(currentSessionId);
  }
  return Array.from(sessionIds);
}

function hydratePersistedClaudeState(): void {
  const startedAt = Date.now();
  if (!process.env.CLAUDE_SESSION_ID) {
    log("hydratePersistedClaudeState skipped: no Claude session id");
    return;
  }
  copyBaseClaudeConfig();
  mkdirSync(CLAUDE_LOCAL_PROJECT_DIR, { recursive: true });
  const prepareScript =
    "mkdir -p " +
    JSON.stringify(CLAUDE_LOCAL_PROJECT_DIR) +
    " " +
    JSON.stringify(CLAUDE_RUNTIME_CONFIG_DIR);
  runTimedBashSync(prepareScript, "hydratePersistedClaudeState(prepare)");
  copyFileIfPresent(
    CLAUDE_PERSIST_STATE_FILE,
    CLAUDE_LOCAL_STATE_FILE,
    "hydratePersistedClaudeState(state)",
  );
  const transcriptSessionIds = collectClaudeTranscriptSessionIds();
  for (const sessionId of transcriptSessionIds) {
    copyFileIfPresent(
      buildClaudeTranscriptPath(CLAUDE_PERSIST_PROJECT_DIR, sessionId),
      buildClaudeTranscriptPath(CLAUDE_LOCAL_PROJECT_DIR, sessionId),
      "hydratePersistedClaudeState(" + sessionId + ")",
    );
  }
  log(
    "hydratePersistedClaudeState sessionIds=" +
      (transcriptSessionIds.length > 0
        ? transcriptSessionIds.join(",")
        : "none"),
  );
  log(
    "hydratePersistedClaudeState finished in " +
      String(Date.now() - startedAt) +
      "ms",
  );
}

function ensureClaudeWorkspaceTrust(): void {
  const configPath = CLAUDE_RUNTIME_CONFIG_DIR + "/.claude.json";
  mkdirSync(CLAUDE_RUNTIME_CONFIG_DIR, { recursive: true });
  const config = {
    ...((existsSync(configPath)
      ? tryParseJsonObject(readFileSync(configPath, "utf8"))
      : null) ?? {}),
  };
  const rawProjects = config.projects;
  const projects =
    rawProjects &&
    typeof rawProjects === "object" &&
    !Array.isArray(rawProjects)
      ? { ...rawProjects }
      : {};
  const rawProject = projects[WORK_DIR];
  const projectEntry =
    rawProject && typeof rawProject === "object" && !Array.isArray(rawProject)
      ? { ...rawProject }
      : {};
  projectEntry.hasTrustDialogAccepted = true;
  projects[WORK_DIR] = projectEntry;
  config.projects = projects;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function resolveClaudeSessionMode(): SessionMode {
  const configuredSessionId = process.env.CLAUDE_SESSION_ID;
  if (!configuredSessionId) {
    return { mode: "none", sessionId: null };
  }
  const persistedState = readClaudeSessionState();
  if (persistedState) {
    if (
      existsSync(
        buildClaudeTranscriptPath(
          CLAUDE_LOCAL_PROJECT_DIR,
          persistedState.resumeSessionId,
        ),
      )
    ) {
      return { mode: "resume", sessionId: persistedState.resumeSessionId };
    }
    log(
      "resolveClaudeSessionMode: persisted state without transcript, starting fresh session",
    );
    return { mode: "session", sessionId: configuredSessionId };
  }
  if (
    existsSync(
      buildClaudeTranscriptPath(CLAUDE_LOCAL_PROJECT_DIR, configuredSessionId),
    )
  ) {
    return { mode: "resume", sessionId: configuredSessionId };
  }
  return { mode: "session", sessionId: configuredSessionId };
}

export function syncClaudeStateToPersist(reason: string): void {
  if (!process.env.CLAUDE_SESSION_ID) {
    return;
  }
  writeClaudeSessionState();
  const prepareScript =
    "mkdir -p " +
    JSON.stringify(CLAUDE_PERSIST_PROJECT_DIR) +
    " " +
    JSON.stringify(CLAUDE_PERSIST_DIR);
  runTimedBashSync(
    prepareScript,
    "syncClaudeStateToPersist(" + reason + ":prepare)",
  );
  copyFileIfPresent(
    CLAUDE_LOCAL_STATE_FILE,
    CLAUDE_PERSIST_STATE_FILE,
    "syncClaudeStateToPersist(" + reason + ":state)",
  );
  const transcriptSessionIds = collectClaudeTranscriptSessionIds();
  for (const sessionId of transcriptSessionIds) {
    copyFileIfPresent(
      buildClaudeTranscriptPath(CLAUDE_LOCAL_PROJECT_DIR, sessionId),
      buildClaudeTranscriptPath(CLAUDE_PERSIST_PROJECT_DIR, sessionId),
      "syncClaudeStateToPersist(" + reason + ":" + sessionId + ")",
    );
  }
  log(
    "syncClaudeStateToPersist(" +
      reason +
      ") sessionIds=" +
      (transcriptSessionIds.length > 0
        ? transcriptSessionIds.join(",")
        : "none"),
  );
}

export function prepareClaudeSessionState(): SessionMode {
  if (!process.env.CLAUDE_SESSION_ID) {
    S.activeClaudeSessionMode = "none";
    updateThinkingStep("Starting Claude CLI...", "Launching Claude process...");
    return { mode: "none", sessionId: null };
  }
  updateThinkingStep(
    "Preparing Claude session...",
    "Hydrating saved session...",
  );
  hydratePersistedClaudeState();
  ensureClaudeWorkspaceTrust();
  const sessionMode = resolveClaudeSessionMode();
  S.activeClaudeSessionMode = sessionMode.mode;
  updateThinkingStep(
    "Preparing Claude session...",
    sessionMode.mode === "resume"
      ? "Saved session hydrated. Starting Claude..."
      : "Preparing fresh saved session...",
  );
  if (sessionMode.sessionId) {
    S.activeClaudeSessionId = sessionMode.sessionId;
  }
  logTranscriptStats(
    sessionMode.sessionId ?? "",
    sessionMode.mode === "resume"
      ? "resume transcript stats"
      : "session transcript stats",
  );
  log(
    "prepareClaudeSessionState resolved mode=" +
      sessionMode.mode +
      " sessionId=" +
      (sessionMode.sessionId || "none"),
  );
  return sessionMode;
}
