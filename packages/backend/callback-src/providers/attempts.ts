import { PROVIDER } from "../config.js";
import {
  prepareClaudeSessionState,
  syncClaudeStateToPersist,
} from "../session/claudeSession.js";
import {
  prepareCodexSessionState,
  syncCodexStateToPersist,
} from "../session/codexSession.js";
import {
  prepareOpencodeSessionState,
  syncOpencodeStateToPersist,
} from "../session/opencodeSession.js";
import {
  prepareCursorSessionState,
  syncCursorStateToPersist,
} from "../session/cursorSession.js";
import { runClaudeSdkAttempt } from "./claudeSdk.js";
import { runCodexSdkAttempt } from "./codexSdk.js";
import { runCursorSdkAttempt } from "./cursorSdk.js";
import { runOpencodeSdkAttempt } from "./opencodeSdk.js";
import type { SessionMode } from "../types.js";

export function prepareProviderSessionState(): SessionMode {
  if (PROVIDER === "codex") return prepareCodexSessionState();
  if (PROVIDER === "opencode") return prepareOpencodeSessionState();
  if (PROVIDER === "cursor") return prepareCursorSessionState();
  return prepareClaudeSessionState();
}

export function syncProviderStateToPersist(reason: string): void {
  if (PROVIDER === "codex") {
    syncCodexStateToPersist();
    return;
  }
  if (PROVIDER === "opencode") {
    syncOpencodeStateToPersist();
    return;
  }
  if (PROVIDER === "cursor") {
    syncCursorStateToPersist();
    return;
  }
  syncClaudeStateToPersist(reason);
}

/**
 * One-shot SDK runner per provider. Claude chat entities with CLAIM_MUTATION
 * enter the persistent daemon earlier in index.ts; job runs and daemon
 * fallbacks land here. OpenCode still needs its CLI binary for `opencode serve`.
 */
export async function runProviderAttempt(sessionMode: SessionMode) {
  if (PROVIDER === "codex") return await runCodexSdkAttempt(sessionMode);
  if (PROVIDER === "opencode") return await runOpencodeSdkAttempt(sessionMode);
  if (PROVIDER === "cursor") return await runCursorSdkAttempt(sessionMode);
  return await runClaudeSdkAttempt(sessionMode);
}
