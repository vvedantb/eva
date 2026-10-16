import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { WORK_DIR } from "./config.js";
import type { JsonObject, JsonValue } from "./types.js";
import { log, tryParseJson } from "./utils.js";

export type McpServerDefinition =
  | { type: "http"; url: string; headers: Record<string, string> }
  | {
      type: "stdio";
      command: string;
      args: string[];
      env: Record<string, string>;
    };

export type McpServers = Record<string, McpServerDefinition>;

type EvaMcpEnvironment = {
  EVA_MCP_AUTH?: string;
  EVA_MCP_BASE_URL?: string;
  LINEAR_MCP_AUTH?: string;
  LINEAR_MCP_URL?: string;
  FIGMA_MCP_AUTH?: string;
  FIGMA_MCP_URL?: string;
};

const LINEAR_MCP_DEFAULT_URL = "https://mcp.linear.app/mcp";
const FIGMA_MCP_DEFAULT_URL = "https://mcp.figma.com/mcp";

export function buildEvaMcpServers({
  auth,
  baseUrl,
}: {
  auth?: string;
  baseUrl?: string;
}): McpServers {
  if (!auth || !baseUrl) return {};
  return {
    eva: {
      type: "http",
      url: `${baseUrl}/mcp`,
      headers: { Authorization: `Bearer ${auth}` },
    },
  };
}

function takeBearerServer(
  env: EvaMcpEnvironment,
  name: string,
  authKey: keyof EvaMcpEnvironment,
  urlKey: keyof EvaMcpEnvironment,
  fallbackUrl: string,
): { servers: McpServers; handoff: Record<string, string> } {
  const auth = env[authKey];
  const url = env[urlKey] || (auth ? fallbackUrl : undefined);
  delete env[authKey];
  delete env[urlKey];
  if (!auth || !url) return { servers: {}, handoff: {} };
  return {
    servers: {
      [name]: {
        type: "http",
        url,
        headers: { Authorization: `Bearer ${auth}` },
      },
    },
    handoff: {
      [authKey]: auth,
      [urlKey]: url,
    },
  };
}

export function consumeEvaMcpEnvironment(env: EvaMcpEnvironment): {
  servers: McpServers;
  workerHandoffEnv: Record<string, string>;
} {
  const eva = buildEvaMcpServers({
    auth: env.EVA_MCP_AUTH,
    baseUrl: env.EVA_MCP_BASE_URL,
  });
  // The callback keeps the MCP descriptor in memory. Removing the transport
  // variables stops agent tools and unrelated child processes inheriting the
  // bearer token through their environment.
  const evaAuth = env.EVA_MCP_AUTH;
  const evaBase = env.EVA_MCP_BASE_URL;
  delete env.EVA_MCP_AUTH;
  delete env.EVA_MCP_BASE_URL;

  const linear = takeBearerServer(
    env,
    "linear",
    "LINEAR_MCP_AUTH",
    "LINEAR_MCP_URL",
    LINEAR_MCP_DEFAULT_URL,
  );
  const figma = takeBearerServer(
    env,
    "figma",
    "FIGMA_MCP_AUTH",
    "FIGMA_MCP_URL",
    FIGMA_MCP_DEFAULT_URL,
  );

  return {
    servers: { ...eva, ...linear.servers, ...figma.servers },
    workerHandoffEnv: {
      ...(evaAuth && evaBase
        ? { EVA_MCP_AUTH: evaAuth, EVA_MCP_BASE_URL: evaBase }
        : {}),
      ...linear.handoff,
      ...figma.handoff,
    },
  };
}

/** Eva's own server names; a repo `.eva/mcp.json` entry can never replace them. */
const RESERVED_MCP_SERVER_NAMES = new Set(["eva", "linear", "figma"]);

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Thrown inside one server's parse; the message becomes the skip warning. */
class SkipServer extends Error {}

function substituteVars(
  value: string,
  env: Record<string, string | undefined>,
): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => {
    const resolved = env[name];
    if (!resolved) throw new SkipServer("missing env var " + name);
    return resolved;
  });
}

function stringRecord(
  value: JsonValue | undefined,
  field: string,
  env: Record<string, string | undefined>,
): Record<string, string> {
  if (value === undefined) return {};
  if (!isJsonObject(value)) throw new SkipServer(field + " must be an object");
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      throw new SkipServer(field + "." + key + " must be a string");
    }
    out[key] = substituteVars(entry, env);
  }
  return out;
}

function parseRepoMcpServer(
  raw: JsonValue,
  env: Record<string, string | undefined>,
): McpServerDefinition {
  if (!isJsonObject(raw)) throw new SkipServer("entry must be an object");
  const { type, url, command, args } = raw;
  const kind =
    type ?? (command !== undefined ? "stdio" : url !== undefined ? "http" : "");
  // SSE servers are descriptor-compatible with http for every provider Eva
  // drives, so they ride the same shape.
  if (kind === "http" || kind === "sse") {
    if (typeof url !== "string") throw new SkipServer("url must be a string");
    return {
      type: "http",
      url: substituteVars(url, env),
      headers: stringRecord(raw.headers, "headers", env),
    };
  }
  if (kind === "stdio") {
    if (typeof command !== "string") {
      throw new SkipServer("command must be a string");
    }
    if (args !== undefined && !Array.isArray(args)) {
      throw new SkipServer("args must be an array");
    }
    return {
      type: "stdio",
      command: substituteVars(command, env),
      args: (args ?? []).map((arg) => {
        if (typeof arg !== "string") throw new SkipServer("args must be strings");
        return substituteVars(arg, env);
      }),
      env: stringRecord(raw.env, "env", env),
    };
  }
  throw new SkipServer("unsupported type " + JSON.stringify(type));
}

/**
 * Parses a repo's committed `.eva/mcp.json` (Claude `.mcp.json` shape) and
 * fills `${VAR}` placeholders from `env`. Never throws: a bad file or server is
 * dropped with a warning so a typo cannot fail the launch.
 */
export function parseRepoMcpConfig(
  text: string,
  env: Record<string, string | undefined>,
): { servers: McpServers; warnings: string[] } {
  const parsed = tryParseJson(text);
  if (!isJsonObject(parsed) || !isJsonObject(parsed.mcpServers)) {
    return {
      servers: {},
      warnings: ["invalid JSON or missing mcpServers object"],
    };
  }
  const servers: McpServers = {};
  const warnings: string[] = [];
  for (const [name, raw] of Object.entries(parsed.mcpServers)) {
    try {
      servers[name] = parseRepoMcpServer(raw, env);
    } catch (error) {
      if (!(error instanceof SkipServer)) throw error;
      warnings.push("skipped server " + name + ": " + error.message);
    }
  }
  return { servers, warnings };
}

/**
 * Repo servers first, Eva's after, so the reserved names always win. Dropped
 * repo entries are reported rather than silently shadowed.
 */
export function mergeRepoMcpServers(
  evaServers: McpServers,
  repoServers: McpServers,
): { servers: McpServers; warnings: string[] } {
  const kept: McpServers = {};
  const warnings: string[] = [];
  for (const [name, server] of Object.entries(repoServers)) {
    if (RESERVED_MCP_SERVER_NAMES.has(name)) {
      warnings.push("skipped server " + name + ": name is reserved for Eva");
    } else {
      kept[name] = server;
    }
  }
  return { servers: { ...kept, ...evaServers }, warnings };
}

/**
 * Reads `<WORK_DIR>/.eva/mcp.json`. The Cursor turn worker re-imports this
 * module and re-reads the file itself, so repo servers need no handoff.
 */
function loadRepoMcpServers(evaServers: McpServers): McpServers {
  const path = join(WORK_DIR, ".eva", "mcp.json");
  if (!existsSync(path)) return evaServers;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    log(".eva/mcp.json unreadable: " + String(error));
    return evaServers;
  }
  const repo = parseRepoMcpConfig(text, process.env);
  const merged = mergeRepoMcpServers(evaServers, repo.servers);
  for (const warning of [...repo.warnings, ...merged.warnings]) {
    log(".eva/mcp.json: " + warning);
  }
  return merged.servers;
}

const consumed = consumeEvaMcpEnvironment(process.env);
export const evaMcpServers = loadRepoMcpServers(consumed.servers);
/**
 * The scrubbed transport variables, re-exported for spawning a trusted child
 * that runs this same callback bundle (the disposable Cursor turn worker).
 * Without this handoff the worker re-imports this module, finds the variables
 * already deleted from the inherited environment, and silently runs the whole
 * turn without the eva MCP server. The child's own module load consumes and
 * deletes them again before any agent tools spawn, so the token still never
 * reaches untrusted processes.
 */
export const evaMcpWorkerHandoffEnv = consumed.workerHandoffEnv;
export const hasEvaMcpConfig = Object.keys(evaMcpServers).length > 0;
