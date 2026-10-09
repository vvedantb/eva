"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { importJWK, SignJWT } from "jose";
import { z } from "zod";
import { SANDBOX_JWT_ISSUER } from "./sandboxAuthConfig";
import { requireEnv } from "./_env/requireEnv";
import { chatEntityKindValidator } from "./_validators/enums";
import { errorText } from "./_shared/errors";

const sandboxPrivateJwkSchema = z
  .object({ kid: z.string().optional() })
  .passthrough();

/**
 * Signs the ES256 sandbox-user JWT that Convex auth accepts (see
 * auth.config.ts). The issuer matches the verifier's SANDBOX_JWT_ISSUER.
 */
export async function signSandboxUserJwt(
  clerkId: string,
  expiresIn: "1h" | "24h",
): Promise<string> {
  const privateKeyJwk = sandboxPrivateJwkSchema.parse(
    JSON.parse(requireEnv("SANDBOX_JWT_PRIVATE_KEY")),
  );
  const kid = privateKeyJwk.kid ?? "sandbox-1";
  const key = await importJWK(privateKeyJwk, "ES256");
  return await new SignJWT({ sub: clerkId })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(SANDBOX_JWT_ISSUER)
    .setAudience("convex")
    .setExpirationTime(expiresIn)
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
    entityKind: v.optional(chatEntityKindValidator),
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
    const sandboxToken = await signSandboxUserJwt(clerkId, "24h");

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
          })
            .setProtectedHeader({ alg: "HS256" })
            .setExpirationTime(`${expiresIn}s`)
            .setIssuedAt()
            .sign(secret);
          mcpToken = { token, expiresIn };
        }
      } catch (error) {
        console.warn(`[mcp] Continuing without MCP token: ${errorText(error)}`);
      }
    }

    return { sandboxToken, mcpToken };
  },
});
