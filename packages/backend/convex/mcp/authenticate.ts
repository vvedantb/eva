import { authenticateClerkBearer, readEnvUrl } from "@vvedantb/server";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

// Eva reads the Clerk issuer from CLERK_JWT_ISSUER_DOMAIN, with the package
// default as fallback. The metadata routes and the JWT check share it.
export const clerkIssuer = {
  name: "CLERK_JWT_ISSUER_DOMAIN",
  fallback: "CLERK_FRONTEND_API_URL",
  fallbackMode: "prefer-primary" as const,
};

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

/**
 * Sandbox tokens are HS256 JWTs. The Clerk JWT check would reject them, so
 * they go to the Node action first. That keeps their repo, entity and chat
 * scope. Clerk access-token JWTs (`at+jwt`) are verified locally. Opaque
 * tokens and session JWTs use the Node `verifyAccessToken` fallback.
 */
export function authenticateMcpToken(
  ctx: Pick<ActionCtx, "runAction">,
  token: string,
): Promise<McpPrincipal | null> {
  const verifyNode = (value: string) =>
    ctx.runAction(internal.mcp.nodeActions.verifyAccessToken, { token: value });
  if (isInternalToken(token)) return verifyNode(token);
  return authenticateClerkBearer({
    token,
    issuer: readEnvUrl(clerkIssuer),
    verifyFallback: verifyNode,
    onReject: (r) =>
      console.error("[MCP][authenticateClerkBearer] rejected:", r.kind),
    onError: (e) =>
      console.error(
        "[MCP][authenticateClerkBearer] threw:",
        e instanceof Error ? e.message : e,
      ),
  });
}
