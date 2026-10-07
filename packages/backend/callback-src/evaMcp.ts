type HttpMcpServerConfig = {
  type: "http";
  url: string;
  headers: Record<string, string>;
};

export type HttpMcpServers = Record<string, HttpMcpServerConfig>;

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
}): HttpMcpServers {
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
): { servers: HttpMcpServers; handoff: Record<string, string> } {
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
  servers: HttpMcpServers;
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

const consumed = consumeEvaMcpEnvironment(process.env);
export const evaMcpServers = consumed.servers;
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
