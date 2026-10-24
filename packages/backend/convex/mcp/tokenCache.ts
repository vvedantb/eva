import { v } from "convex/values";
import {
  authenticateWithTokenCache as authenticateWithPackageCache,
  createMcpTokenCacheFunctions,
  type McpTokenCachePrincipal,
  type McpTokenCachePurgeRef,
} from "@vvedantb/server";
import { internal } from "../_generated/api";
import {
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../_generated/server";

// Verified MCP bearer tokens, so most requests skip the Node verify action
// (Clerk network plus a Node cold start). The cache logic (hash-only rows,
// successes only, TTL min(5 min, JWT exp), paged purge) is in @vvedantb/server.

export const { getInternal, putInternal, purgeExpired } =
  createMcpTokenCacheFunctions({
    v,
    internalQuery,
    internalMutation,
    purgeSelf: (): McpTokenCachePurgeRef =>
      internal.mcp.tokenCache.purgeExpired,
  });

/**
 * Cache lookup, then `verify` on a miss. A null from `verify` is returned
 * as is and never cached, so invalid tokens behave exactly as before.
 */
export function authenticateWithTokenCache(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  token: string,
  verify: (token: string) => Promise<McpTokenCachePrincipal | null>,
): Promise<McpTokenCachePrincipal | null> {
  return authenticateWithPackageCache({
    token,
    get: (tokenHash) =>
      ctx.runQuery(internal.mcp.tokenCache.getInternal, { tokenHash }),
    put: (row) => ctx.runMutation(internal.mcp.tokenCache.putInternal, row),
    verify,
  });
}
