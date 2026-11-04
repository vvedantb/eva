import { mkdirSync, writeFileSync } from "fs";
import {
  OPENCODE_AUTH_DIR,
  OPENCODE_AUTH_FILE,
  OPENCODE_AUTH_JSON,
  OPENCODE_AUTH_JSON_BASE64,
  OPENCODE_CONFIG_JSON,
  OPENCODE_CONFIG_JSON_BASE64,
  OPENCODE_LOCAL_STATE_FILE,
  OPENCODE_PERSIST_AUTH_FILE,
  OPENCODE_PERSIST_DIR,
  OPENCODE_PERSIST_STATE_FILE,
  OPENCODE_RUNTIME_HOME_DIR,
} from "../config.js";
import { updateThinkingStep } from "../parse/canonical.js";
import { callbackState as S } from "../runtime/state.js";
import type { SessionMode } from "../types.js";
import { copyFileIfPresent, decodeBase64 } from "../utils.js";
import { createSessionStore } from "./createSessionStore.js";

const store = createSessionStore({
  runtimeHomeDir: OPENCODE_RUNTIME_HOME_DIR,
  persistDir: OPENCODE_PERSIST_DIR,
  localStateFile: OPENCODE_LOCAL_STATE_FILE,
  persistStateFile: OPENCODE_PERSIST_STATE_FILE,
  resumeField: "resumeSessionId",
  getActiveId: () => S.activeOpencodeSessionId,
  setActiveId: (id) => {
    S.activeOpencodeSessionId = id;
  },
});

const readOpencodeSessionState = store.readSessionState;
export const writeOpencodeSessionState = store.writeSessionState;
export function syncOpencodeStateToPersist(): void {
  store.syncStateToPersist("syncOpencodeStateToPersist");
  copyFileIfPresent(
    OPENCODE_AUTH_FILE,
    OPENCODE_PERSIST_AUTH_FILE,
    "syncOpencodeStateToPersist(auth)",
  );
}

/**
 * Object form, not '"allow"': opencode deep-merges this JSON into the config
 * permission record, so a bare string becomes {0:"a",1:"l",...}. On 1.18.16
 * that config fails validation and `GET /config` answers 400 forever, so the
 * health probe never passes and a cold server start timed out after 60s.
 */
export const OPENCODE_PERMISSION_ALLOW_ALL = '{"*":"allow"}';

function hydratePersistedOpencodeState(): void {
  store.hydratePersistedState("hydratePersistedOpencodeState");
  const configJson =
    OPENCODE_CONFIG_JSON ||
    (OPENCODE_CONFIG_JSON_BASE64
      ? decodeBase64(OPENCODE_CONFIG_JSON_BASE64)
      : "");
  if (configJson) {
    process.env.OPENCODE_CONFIG_CONTENT = configJson;
  }
  mkdirSync(OPENCODE_AUTH_DIR, { recursive: true });
  const authJson =
    OPENCODE_AUTH_JSON ||
    (OPENCODE_AUTH_JSON_BASE64 ? decodeBase64(OPENCODE_AUTH_JSON_BASE64) : "");
  if (authJson) {
    writeFileSync(OPENCODE_AUTH_FILE, authJson);
  } else {
    copyFileIfPresent(
      OPENCODE_PERSIST_AUTH_FILE,
      OPENCODE_AUTH_FILE,
      "hydratePersistedOpencodeState(auth)",
    );
  }
  process.env.OPENCODE_PERMISSION = OPENCODE_PERMISSION_ALLOW_ALL;
  process.env.OPENCODE_DISABLE_AUTOUPDATE = "1";
}

export function prepareOpencodeSessionState(): SessionMode {
  updateThinkingStep(
    "Preparing Opencode session...",
    "Hydrating saved session...",
  );
  hydratePersistedOpencodeState();
  const persistedState = readOpencodeSessionState();
  updateThinkingStep(
    "Preparing Opencode session...",
    persistedState
      ? "Saved session hydrated. Starting Opencode..."
      : "Preparing fresh Opencode session...",
  );
  if (persistedState && persistedState.resumeSessionId) {
    S.activeOpencodeSessionId = persistedState.resumeSessionId;
    return { mode: "resume", sessionId: persistedState.resumeSessionId };
  }
  return { mode: "none", sessionId: null };
}
