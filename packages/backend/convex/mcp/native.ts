import { httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  createAuthorizationServerMetadataProxy,
  createHealthHandler,
  createMcpHttpHandler,
  createProtectedResourceMetadata,
} from "@vvedantb/server";
import {
  authenticateMcpToken,
  clerkIssuer,
  type McpPrincipal,
} from "./authenticate";

// Clerk is the OAuth authorization server. These routes only point clients at it.
export const oauthMetadata = httpAction(
  createAuthorizationServerMetadataProxy({ issuer: clerkIssuer }),
);

export const protectedResourceMetadata = httpAction(
  createProtectedResourceMetadata({ authorizationServer: clerkIssuer }),
);

export const mcpHandler = httpAction(
  createMcpHttpHandler<McpPrincipal, ActionCtx>({
    authenticate: ({ ctx, token }) => authenticateMcpToken(ctx, token),
    handleRpc: ({ ctx, principal, body }) =>
      ctx.runAction(internal.mcp.nodeActions.handleMcpRequest, {
        clerkUserId: principal.clerkUserId,
        scopedRepoId: principal.scopedRepoId,
        entityId: principal.entityId,
        entityKind: principal.entityKind,
        chatId: principal.chatId,
        body,
      }),
  }),
);

export const health = httpAction(createHealthHandler());
