type HttpMcpServerConfig = {
  type: "http";
  url: string;
  headers: Record<string, string>;
};

export type HttpMcpServers = Record<string, HttpMcpServerConfig>;

type EvaMcpEnvironment = {
  EVA_MCP_AUTH?: string;
  EVA_MCP_BASE_URL?: string;
};

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

export function consumeEvaMcpEnvironment(env: EvaMcpEnvironment): {
  servers: HttpMcpServers;
  workerHandoffEnv: Record<string, string>;
} {
  const auth = env.EVA_MCP_AUTH;
  const baseUrl = env.EVA_MCP_BASE_URL;
  const servers = buildEvaMcpServers({ auth, baseUrl });
  // The callback keeps the MCP descriptor in memory. Removing the transport
  // variables stops agent tools and unrelated child processes inheriting the
  // bearer token through their environment.
  delete env.EVA_MCP_AUTH;
  delete env.EVA_MCP_BASE_URL;
  return {
    servers,
    workerHandoffEnv:
      auth && baseUrl ? { EVA_MCP_AUTH: auth, EVA_MCP_BASE_URL: baseUrl } : {},
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
