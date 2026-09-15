"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { resolveAllEnvVars } from "../envVarResolver";
import { connectorProviderValidator } from "../validators";
import { pickConnectorToken, type PickedConnectorToken } from "./pick";
import {
  CONNECTOR_MCP_URL,
  CONNECTOR_PROVIDERS,
  injectOfficialMcp,
  pickEnvToken,
  type ConnectorProvider,
} from "./providers";
import { resolveUserAccessToken } from "./oauth";

async function envTokenForRepo(
  ctx: ActionCtx,
  provider: ConnectorProvider,
  repoId: Id<"githubRepos"> | null,
): Promise<string | null> {
  if (!repoId) return null;
  const envVars = await resolveAllEnvVars(ctx, repoId);
  return pickEnvToken(envVars, provider);
}

export async function resolveConnectorToken(
  ctx: ActionCtx,
  userId: Id<"users">,
  provider: ConnectorProvider,
  repoId: Id<"githubRepos"> | null,
): Promise<PickedConnectorToken | null> {
  let oauthToken: string | null = null;
  try {
    oauthToken = await resolveUserAccessToken(ctx, userId, provider);
  } catch {
    // Table not deployed yet, or refresh failed — still use the env key.
  }
  return pickConnectorToken(oauthToken, await envTokenForRepo(ctx, provider, repoId));
}

export const resolveAccessToken = internalAction({
  args: {
    userId: v.id("users"),
    provider: connectorProviderValidator,
    repoId: v.union(v.id("githubRepos"), v.null()),
  },
  returns: v.union(
    v.object({
      token: v.string(),
      source: v.union(v.literal("oauth"), v.literal("env")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) =>
    await resolveConnectorToken(ctx, args.userId, args.provider, args.repoId),
});

/**
 * Env injected at sandbox launch. Linear MCP always gets a bearer when any
 * token exists. Figma official MCP only gets an OAuth token — PATs are rejected.
 */
export async function resolveConnectorLaunchEnv(
  ctx: ActionCtx,
  userId: Id<"users">,
  repoId: Id<"githubRepos">,
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const provider of CONNECTOR_PROVIDERS) {
    const picked = await resolveConnectorToken(ctx, userId, provider, repoId);
    if (!picked) continue;
    if (picked.source === "oauth") {
      const apiKey =
        provider === "linear" ? "LINEAR_API_KEY" : "FIGMA_API_KEY";
      env[apiKey] = picked.token;
    }
    if (injectOfficialMcp(provider, picked.source)) {
      const prefix = provider === "linear" ? "LINEAR_MCP" : "FIGMA_MCP";
      env[`${prefix}_AUTH`] = picked.token;
      env[`${prefix}_URL`] = CONNECTOR_MCP_URL[provider];
    }
  }
  return env;
}

export const resolveLaunchEnv = internalAction({
  args: {
    userId: v.id("users"),
    repoId: v.id("githubRepos"),
  },
  returns: v.record(v.string(), v.string()),
  handler: async (ctx, args) =>
    await resolveConnectorLaunchEnv(ctx, args.userId, args.repoId),
});
