import { z } from "zod";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { authenticateWithTokenCache } from "./tokenCache";

/** Optional fields are set only by sandbox (`mcp-internal`) tokens. */
export type McpPrincipal = {
  clerkUserId: string;
  scopedRepoId?: string;
  entityId?: string;
  entityKind?: "session" | "task" | "project";
  chatId?: string;
};

const MCP_INTERNAL_AUDIENCE = "mcp-internal";

const audiencePayload = z.object({
  aud: z.union([z.string(), z.array(z.string())]),
});

/**
 * Reads `aud` from an unverified JWT payload. This only routes the token:
 * `verifyAccessToken` checks the signature. Opaque tokens and unreadable
 * payloads return false.
 */
export function isInternalToken(token: string): boolean {
  const segment = token.split(".")[1];
  if (segment === undefined) return false;
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = audiencePayload.safeParse(JSON.parse(atob(base64)));
    if (!parsed.success) return false;
    const { aud } = parsed.data;
    return typeof aud === "string"
      ? aud === MCP_INTERNAL_AUDIENCE
      : aud.includes(MCP_INTERNAL_AUDIENCE);
  } catch {
    return false;
  }
}

type AuthenticateDeps = {
  token: string;
  verify: (token: string) => Promise<McpPrincipal | null>;
  cached: (
    token: string,
    verify: (token: string) => Promise<McpPrincipal | null>,
  ) => Promise<McpPrincipal | null>;
};

/**
 * Sandbox tokens skip the cache: it stores only `clerkUserId`, so a hit would
 * drop the repo, entity and chat scope. Clerk tokens go through the cache.
 */
export function authenticateWith({
  token,
  verify,
  cached,
}: AuthenticateDeps): Promise<McpPrincipal | null> {
  return isInternalToken(token) ? verify(token) : cached(token, verify);
}

export function authenticateMcpToken(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation" | "runAction">,
  token: string,
): Promise<McpPrincipal | null> {
  return authenticateWith({
    token,
    verify: (uncached) =>
      ctx.runAction(internal.mcp.nodeActions.verifyAccessToken, {
        token: uncached,
      }),
    cached: (value, verify) => authenticateWithTokenCache(ctx, value, verify),
  });
}
