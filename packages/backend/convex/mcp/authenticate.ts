import {
  authenticateClerkBearer,
  base64UrlToBytes,
  readEnvUrl,
} from "@vvedantb/server";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

// Clerk bearer tokens stay a working alternative to Eva's own MCP OAuth
// tokens. The issuer comes from CLERK_JWT_ISSUER_DOMAIN, with the package
// default as fallback.
const clerkIssuer = {
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

/**
 * Audiences Eva signs itself (HS256): sandbox tokens (`mcp-internal`) and
 * tokens from Eva's own MCP OAuth server (`mcp-oauth`).
 */
const EVA_AUDIENCES = new Set(["mcp-internal", "mcp-oauth"]);

const audiencePayload = z.object({
  aud: z.union([z.string(), z.array(z.string())]),
});

/**
 * Reads `aud` from an unverified JWT payload. This only routes the token:
 * `verifyAccessToken` checks the signature. Opaque tokens and unreadable
 * payloads return false.
 */
export function isEvaSignedToken(token: string): boolean {
  const segment = token.split(".")[1];
  if (segment === undefined) return false;
  try {
    const payload = new TextDecoder().decode(base64UrlToBytes(segment));
    const parsed = audiencePayload.safeParse(JSON.parse(payload));
    if (!parsed.success) return false;
    const { aud } = parsed.data;
    const audiences = typeof aud === "string" ? [aud] : aud;
    return audiences.some((value) => EVA_AUDIENCES.has(value));
  } catch {
    return false;
  }
}

/**
 * Eva-signed tokens (sandbox `mcp-internal`, Eva OAuth `mcp-oauth`) go
 * straight to the Node action, which checks them in that order. Sandbox
 * tokens keep their repo, entity and chat scope. Anything else is a Clerk
 * bearer: access-token JWTs (`at+jwt`) are verified locally, and opaque
 * tokens and session JWTs use the Node `verifyAccessToken` fallback.
 */
export function authenticateMcpToken(
  ctx: Pick<ActionCtx, "runAction">,
  token: string,
): Promise<McpPrincipal | null> {
  const verifyNode = (value: string) =>
    ctx.runAction(internal.mcp.nodeActions.verifyAccessToken, { token: value });
  if (isEvaSignedToken(token)) return verifyNode(token);
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
