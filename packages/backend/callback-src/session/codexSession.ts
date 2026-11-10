import { mkdirSync, writeFileSync } from "fs";
import {
  CODEX_AUTH_FILE,
  CODEX_AUTH_JSON,
  CODEX_AUTH_JSON_BASE64,
  CODEX_CONFIG_TOML,
  CODEX_CONFIG_TOML_BASE64,
  CODEX_LOCAL_STATE_FILE,
  CODEX_PERSIST_AUTH_FILE,
  CODEX_PERSIST_STATE_FILE,
  CODEX_PERSIST_DIR,
  CODEX_RUNTIME_HOME_DIR,
  codexFastMode,
  codexReasoningEffort,
} from "../config.js";
import { evaMcpServers, type McpServers } from "../evaMcp.js";
import { updateThinkingStep } from "../parse/canonical.js";
import { callbackState as S } from "../runtime/state.js";
import type { SessionMode } from "../types.js";
import { copyFileIfPresent, decodeBase64 } from "../utils.js";
import { createSessionStore } from "./createSessionStore.js";

const store = createSessionStore({
  runtimeHomeDir: CODEX_RUNTIME_HOME_DIR,
  persistDir: CODEX_PERSIST_DIR,
  localStateFile: CODEX_LOCAL_STATE_FILE,
  persistStateFile: CODEX_PERSIST_STATE_FILE,
  resumeField: "resumeThreadId",
  getActiveId: () => S.activeCodexThreadId,
  setActiveId: (id) => {
    S.activeCodexThreadId = id;
  },
});

const readCodexSessionState = store.readSessionState;
export const writeCodexSessionState = store.writeSessionState;
export function syncCodexStateToPersist(): void {
  store.syncStateToPersist("syncCodexStateToPersist");
  copyFileIfPresent(
    CODEX_AUTH_FILE,
    CODEX_PERSIST_AUTH_FILE,
    "syncCodexStateToPersist(auth)",
  );
}

function writeCodexFileIfConfigured(
  fileName: string,
  rawValue: string,
  encodedValue: string,
): void {
  const value = rawValue || (encodedValue ? decodeBase64(encodedValue) : "");
  if (!value) {
    return;
  }
  mkdirSync(CODEX_RUNTIME_HOME_DIR, { recursive: true });
  writeFileSync(CODEX_RUNTIME_HOME_DIR + "/" + fileName, value);
}

function tomlInlineTable(record: Record<string, string>): string {
  const entries = Object.entries(record)
    .map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(value)}`)
    .join(", ");
  return `{ ${entries} }`;
}

/**
 * Eva's MCP servers (HTTP and repo stdio) as `[mcp_servers.*]` sections.
 *
 * Codex only reads MCP config from `CODEX_HOME/config.toml`, and both codex
 * paths point at the same CODEX_HOME (the SDK CLI and the app-server daemon,
 * which spawns after this file is written), so this is the one wiring point for
 * both. Table headers rather than dotted keys, appended last: a `[table]` in
 * the preserved account config can then never capture these keys.
 *
 * The bearer token rides in the config file next to `auth.json` rather than in
 * a `bearer_token_env_var`, because the callback deliberately scrubs the
 * transport credentials out of the environment agent tools inherit.
 */
function codexMcpServerSections(servers: McpServers): string[] {
  return Object.entries(servers).flatMap(([name, server]) => {
    const header = ["", `[mcp_servers.${JSON.stringify(name)}]`];
    if (server.type === "stdio") {
      return [
        ...header,
        `command = ${JSON.stringify(server.command)}`,
        `args = [${server.args.map((arg) => JSON.stringify(arg)).join(", ")}]`,
        `env = ${tomlInlineTable(server.env)}`,
      ];
    }
    return [
      ...header,
      `url = ${JSON.stringify(server.url)}`,
      `http_headers = ${tomlInlineTable(server.headers)}`,
    ];
  });
}

export function buildCodexRuntimeConfig(
  rawValue: string,
  encodedValue: string,
  fastMode = codexFastMode,
  mcpServers = evaMcpServers,
): string {
  const configuredValue =
    rawValue || (encodedValue ? decodeBase64(encodedValue) : "");
  const preservedLines = configuredValue
    ? configuredValue.split(/\r?\n/).filter((line) => {
        const trimmed = line.trim().toLowerCase();
        return (
          !trimmed.startsWith("sandbox_mode") &&
          !trimmed.startsWith("approval_policy") &&
          // Eva owns the Fast toggle; account config must not silently opt in.
          !trimmed.startsWith("service_tier") &&
          // Drop any configured reasoning effort; the session lever wins when set.
          !(
            codexReasoningEffort && trimmed.startsWith("model_reasoning_effort")
          )
        );
      })
    : [];
  const normalizedPreservedLines = preservedLines.filter((line) => line.trim());
  const runtimeLines = [
    'approval_policy = "never"',
    'sandbox_mode = "danger-full-access"',
  ];
  if (codexReasoningEffort) {
    runtimeLines.push(`model_reasoning_effort = "${codexReasoningEffort}"`);
  }
  if (fastMode) {
    runtimeLines.push('service_tier = "fast"');
  }
  if (normalizedPreservedLines.length > 0) {
    runtimeLines.push(...normalizedPreservedLines);
  }
  runtimeLines.push(...codexMcpServerSections(mcpServers));
  return runtimeLines.join("\n") + "\n";
}

function hydratePersistedCodexState(): void {
  store.hydratePersistedState("hydratePersistedCodexState");
  if (!CODEX_AUTH_JSON && !CODEX_AUTH_JSON_BASE64) {
    copyFileIfPresent(
      CODEX_PERSIST_AUTH_FILE,
      CODEX_AUTH_FILE,
      "hydratePersistedCodexState(auth)",
    );
  }
  writeCodexFileIfConfigured(
    "auth.json",
    CODEX_AUTH_JSON,
    CODEX_AUTH_JSON_BASE64,
  );
  mkdirSync(CODEX_RUNTIME_HOME_DIR, { recursive: true });
  writeFileSync(
    CODEX_RUNTIME_HOME_DIR + "/config.toml",
    buildCodexRuntimeConfig(CODEX_CONFIG_TOML, CODEX_CONFIG_TOML_BASE64),
  );
}

export function prepareCodexSessionState(): SessionMode {
  updateThinkingStep(
    "Preparing Codex session...",
    "Hydrating saved session...",
  );
  hydratePersistedCodexState();
  const persistedState = readCodexSessionState();
  updateThinkingStep(
    "Preparing Codex session...",
    persistedState
      ? "Saved session hydrated. Starting Codex..."
      : "Preparing fresh Codex session...",
  );
  return persistedState && persistedState.resumeThreadId
    ? { mode: "resume", sessionId: persistedState.resumeThreadId }
    : { mode: "none", sessionId: null };
}
