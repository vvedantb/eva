import { httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { isMaintenanceMode } from "../maintenance";
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

export const oauthMetadata = httpAction(
  createAuthorizationServerMetadataProxy({ issuer: clerkIssuer }),
);

export const protectedResourceMetadata = httpAction(
  createProtectedResourceMetadata({ authorizationServer: clerkIssuer }),
);

const handleMcp = createMcpHttpHandler<McpPrincipal, ActionCtx>({
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
});

export const mcpHandler = httpAction(async (ctx, request) =>
  isMaintenanceMode()
    ? Response.json(
        { error: "Eva is down for maintenance. Try again shortly." },
        { status: 503, headers: { "Retry-After": "300" } },
      )
    : handleMcp(ctx, request),
);

export const health = httpAction(createHealthHandler());
