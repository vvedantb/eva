import type { Infer } from "convex/values";
import type { connectorProviderValidator } from "../_validators/tableFields";

export type ConnectorProvider = Infer<typeof connectorProviderValidator>;

export const CONNECTOR_PROVIDERS = ["linear", "figma"] as const;

/** Team/repo env keys that satisfy the env-var fallback, first key wins. */
export const CONNECTOR_ENV_KEYS: Record<
  ConnectorProvider,
  readonly [string, ...string[]]
> = {
  linear: ["LINEAR_API_KEY", "LINEAR_TOKEN"],
  figma: ["FIGMA_API_KEY", "FIGMA_TOKEN"],
};

export const CONNECTOR_MCP_URL: Record<ConnectorProvider, string> = {
  linear: "https://mcp.linear.app/mcp",
  figma: "https://mcp.figma.com/mcp",
};

export const CONNECTOR_LABEL: Record<ConnectorProvider, string> = {
  linear: "Linear",
  figma: "Figma",
};

export function envKeysFor(provider: ConnectorProvider): readonly string[] {
  return CONNECTOR_ENV_KEYS[provider];
}

export function pickEnvToken(
  envVars: Record<string, string>,
  provider: ConnectorProvider,
): string | null {
  for (const key of CONNECTOR_ENV_KEYS[provider]) {
    const value = envVars[key];
    if (value && value.length > 0) return value;
  }
  return null;
}

export function oauthClientIdEnv(provider: ConnectorProvider): string {
  return provider === "linear" ? "LINEAR_CLIENT_ID" : "FIGMA_CLIENT_ID";
}

export function oauthClientSecretEnv(provider: ConnectorProvider): string {
  return provider === "linear" ? "LINEAR_CLIENT_SECRET" : "FIGMA_CLIENT_SECRET";
}

export function isOAuthConfigured(provider: ConnectorProvider): boolean {
  const id = process.env[oauthClientIdEnv(provider)];
  const secret = process.env[oauthClientSecretEnv(provider)];
  return Boolean(id && secret);
}

export function readOAuthClient(provider: ConnectorProvider): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = process.env[oauthClientIdEnv(provider)];
  const clientSecret = process.env[oauthClientSecretEnv(provider)];
  if (!clientId || !clientSecret) {
    throw new Error(
      `${CONNECTOR_LABEL[provider]} OAuth is not configured. Set ${oauthClientIdEnv(provider)} and ${oauthClientSecretEnv(provider)} in Convex env, or paste ${CONNECTOR_ENV_KEYS[provider][0]} on the team.`,
    );
  }
  return { clientId, clientSecret };
}

export function authorizeUrl(provider: ConnectorProvider): string {
  return provider === "linear"
    ? "https://linear.app/oauth/authorize"
    : "https://www.figma.com/oauth";
}

export function tokenUrl(provider: ConnectorProvider): string {
  return provider === "linear"
    ? "https://api.linear.app/oauth/token"
    : "https://api.figma.com/v1/oauth/token";
}

export function refreshUrl(provider: ConnectorProvider): string {
  return provider === "linear"
    ? "https://api.linear.app/oauth/token"
    : "https://api.figma.com/v1/oauth/refresh";
}

export function revokeUrl(provider: ConnectorProvider): string | null {
  return provider === "linear" ? "https://api.linear.app/oauth/revoke" : null;
}

export function oauthScopes(provider: ConnectorProvider): string {
  return provider === "linear"
    ? "read,write,issues:create,comments:create"
    : "file_content:read,current_user:read,file_comments:read";
}

/** Official Figma MCP rejects PATs; only try it with an OAuth access token. */
export function injectOfficialMcp(
  provider: ConnectorProvider,
  source: "oauth" | "env",
): boolean {
  if (provider === "linear") return true;
  return source === "oauth";
}
