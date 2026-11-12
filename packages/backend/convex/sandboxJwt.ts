"use node";

import { errorMessage, requiredEnv } from "@vvedantb/server";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { importJWK, SignJWT } from "jose";
import { z } from "zod";
import { SANDBOX_JWT_ISSUER } from "./sandboxAuthConfig";
import { EVA_MCP_CLAIM } from "./_auth/sandboxIdentity";

const sandboxPrivateJwkSchema = z
  .object({ kid: z.string().optional() })
  .passthrough();

/**
 * `vm`: the daemon's CONVEX_TOKEN (24h, no claim). `mcp`: the MCP `runAsUser`
 * token (1h) marked with EVA_MCP_CLAIM, so the backend can tell the two apart
 * (`_auth/sandboxIdentity.ts`). Only MCP is marked, so in-flight VM tokens keep
 * their meaning.
 */
export type SandboxJwtPurpose = "vm" | "mcp";

/**
 * Signs the ES256 sandbox-user JWT that Convex auth accepts (see
 * auth.config.ts). The issuer matches the verifier's SANDBOX_JWT_ISSUER.
 */
export async function signSandboxUserJwt(
  clerkId: string,
  purpose: SandboxJwtPurpose,
): Promise<string> {
  const privateKeyJwk = sandboxPrivateJwkSchema.parse(
    JSON.parse(requiredEnv("SANDBOX_JWT_PRIVATE_KEY")),
  );
  const kid = privateKeyJwk.kid ?? "sandbox-1";
  const key = await importJWK(privateKeyJwk, "ES256");
  const claims =
    purpose === "mcp" ? { sub: clerkId, [EVA_MCP_CLAIM]: true } : { sub: clerkId };
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(SANDBOX_JWT_ISSUER)
    .setAudience("convex")
    .setExpirationTime(purpose === "mcp" ? "1h" : "24h")
    .setIssuedAt()
    .sign(key);
}

/**
 * Mints BOTH sandbox-launch tokens in a single node action: the ES256 sandbox
 * auth token and the HS256 MCP-internal token. Previously these were minted via
 * three separate `runAction` hops across two "use node" isolates (signSandboxToken
 * + mintSandboxMcpToken → mintInternalToken), which cold-started Node twice and
 * added ~3s of launch latency. Signing both here — after one clerkId lookup —
 * collapses that to a single node cold start and one round-trip.
 *
 * The MCP token is best-effort: if MCP is disabled or the secret is missing, it
 * returns null and the launch proceeds without MCP (matching the prior caller's
 * catch). The sandbox token is required — a failure to sign it throws.
 */
export const mintSandboxSessionTokens = internalAction({
  args: {
    userId: v.id("users"),
    repoId: v.id("githubRepos"),
    enableMcp: v.boolean(),
    // Optional launch-entity identity embedded in the MCP-internal token so
    // entity-scoped tools (browser_start/lock/unlock) can resolve the
    // session/task/project without the agent passing an id.
    entityId: v.optional(v.string()),
    entityKind: v.optional(
      v.union(v.literal("session"), v.literal("task"), v.literal("project")),
    ),
    // The session chat a session daemon runs. `entityId` stays the session so
    // session-level tools (dev server, browser, PRs) keep resolving; chat
    // content (panels, questions, env var cards) lands on this row instead.
    chatId: v.optional(v.string()),
  },
  returns: v.object({
    sandboxToken: v.string(),
    mcpToken: v.union(
      v.object({ token: v.string(), expiresIn: v.number() }),
      v.null(),
    ),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    sandboxToken: string;
    mcpToken: { token: string; expiresIn: number } | null;
  }> => {
    const clerkId = await ctx.runQuery(internal.auth.getUserClerkId, {
      userId: args.userId,
    });
    if (!clerkId) {
      throw new Error("User has no clerkId");
    }

    // Sandbox auth token (ES256) — required.
    const sandboxToken = await signSandboxUserJwt(clerkId, "vm");

    // MCP-internal token (HS256) — best-effort.
    let mcpToken: { token: string; expiresIn: number } | null = null;
    if (args.enableMcp) {
      try {
        const internalSecret = process.env.MCP_INTERNAL_SECRET;
        if (internalSecret) {
          const secret = new TextEncoder().encode(internalSecret);
          const expiresIn = 28800; // 8 hours
          const token = await new SignJWT({
            sub: clerkId,
            iss: "eva",
            aud: "mcp-internal",
            repoId: String(args.repoId),
            ...(args.entityId !== undefined ? { entityId: args.entityId } : {}),
            ...(args.entityKind !== undefined
              ? { entityKind: args.entityKind }
              : {}),
            ...(args.chatId !== undefined ? { chatId: args.chatId } : {}),
          })
            .setProtectedHeader({ alg: "HS256" })
            .setExpirationTime(`${expiresIn}s`)
            .setIssuedAt()
            .sign(secret);
          mcpToken = { token, expiresIn };
        }
      } catch (error) {
        console.warn(
          `[mcp] Continuing without MCP token: ${errorMessage(error)}`,
        );
      }
    }

    return { sandboxToken, mcpToken };
  },
});
