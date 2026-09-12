import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  ENTITY_KINDS,
  entityAccess,
  entityPath,
  entityRefArgs,
  entitySummary,
  repoRefArgs,
} from "./entityRef";
import {
  errorResult,
  mcpGetContext,
  mcpListUserRepos,
  textResult,
  type McpCredentials,
} from "./toolShared";

/**
 * Tools that inspect and operate the chats a caller already has: what exists,
 * whether its preview VM is up, and what is still waiting in its queue.
 *
 * Deliberately absent: anything that patches a session, task or project's
 * status or review state. Those stay a person's call, so an agent can drive a
 * sandbox without also moving work through the board.
 */
export function registerEntityTools(
  server: McpServer,
  credentials: McpCredentials,
  ctx: ActionCtx,
): void {
  const { clerkUserId } = credentials;
  // Chat tools use the per-user check only: every chat the user can open in
  // Eva is reachable, whichever repo minted the token (see entityAccess).
  const { assertUserRepoAccess, resolveRepoRef, resolveEntityTarget } =
    entityAccess(ctx, credentials);

  // ───────────────────────────────────────────────────────────────────────────
  // list_entities
  // ───────────────────────────────────────────────────────────────────────────

  server.tool(
    "list_entities",
    `List the Eva sessions, quick tasks and projects you can reach, most recently updated first. Use it to find something that already exists — and to avoid creating a second copy of work that is already in flight.

Each row carries the Convex "id" and "numId" that send_chat_message, start_sandbox and cancel_queued_message accept, plus "status", "sandboxStatus", "isExecuting" and "prUrl" so you can tell what is safe to merge, retry or leave alone.

Only entities you could already open in Eva are returned. The page is capped; "truncated" is true when more matched than fit. Listing is per repo, so a project's child task that has no repo of its own is not listed — reach it by id instead.`,
    {
      kind: z
        .enum(ENTITY_KINDS)
        .optional()
        .describe(
          'Limit to one surface: "session", "task" (quick task) or "project". Omit for all three.',
        ),
      status: z
        .string()
        .optional()
        .describe(
          'Exact lifecycle value to filter on: a session\'s sandbox status ("active", "starting", "stopping", "closed"), a task\'s status ("draft", "todo", "in_progress", "code_review", "business_review", "done", "cancelled"), or a project\'s phase ("draft", "finalized", "in_progress", "business_review", "code_review", "completed", "cancelled"). A value that belongs to another surface simply matches nothing there.',
        ),
      limit: z
        .number()
        .min(1)
        .max(50)
        .default(25)
        .describe("Max rows to return (default 25, max 50)."),
      ...repoRefArgs,
    },
    async ({ kind, status, limit, repoId, repoName, app }) => {
      const { userId } = await mcpGetContext(ctx, clerkUserId);

      // Naming a repo narrows the scan; naming none lists across every repo
      // the caller can reach, which is the same set either way.
      let repos = await mcpListUserRepos(ctx, userId);
      if (repoId !== undefined || repoName !== undefined) {
        const ref = await resolveRepoRef({ repoId, repoName, app }, userId);
        if ("isError" in ref) return ref;
        await assertUserRepoAccess(ref.repoId, userId);
        repos = repos.filter((repo) => repo.id === ref.repoId);
      }

      const result = await ctx.runQuery(
        internal.mcp.queries.listEntitiesForUser,
        {
          userId,
          repoIds: repos.map((repo) => repo.id),
          kind,
          status,
          limit,
        },
      );

      const entities = result.entities.map((entity) => ({
        kind: entity.kind,
        id: entity.id,
        numId: entity.numId,
        title: entity.title,
        status: entity.status,
        sandboxStatus: entity.sandboxStatus,
        isExecuting: entity.isExecuting,
        archived: entity.archived,
        prUrl: entity.prUrl,
        branch: entity.branchName,
        updatedAt: entity.updatedAt,
        repo: `${entity.repoOwner}/${entity.repoName}`,
        path: entityPath(entity),
      }));

      return textResult({
        entities,
        count: entities.length,
        truncated: result.truncated,
      });
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // start_sandbox / stop_sandbox
  // ───────────────────────────────────────────────────────────────────────────

  server.tool(
    "start_sandbox",
    `Start the preview sandbox for a session, quick task or project — the same Start button the Eva UI has. Returns only once the VM is genuinely active, or fails saying why; it never leaves you guessing at "resuming sandbox".

Already-active sandboxes are left alone. Each surface has its own gate: a quick task must be in code_review, business_review or done, and a project must be in in_progress, business_review or code_review, before a preview sandbox will start.`,
    entityRefArgs,
    async (ref) => {
      const { userId } = await mcpGetContext(ctx, clerkUserId);
      const resolved = await resolveEntityTarget(ref, userId);
      if ("isError" in resolved) return resolved;
      const { target } = resolved;

      const result = await ctx.runAction(
        internal.mcp.nodeActions.mcpStartEntitySandbox,
        { clerkUserId, kind: target.kind, id: target.targetId },
      );

      return textResult({
        ...entitySummary(target),
        sandboxStatus: result.sandboxStatus,
        started: result.startRequested,
      });
    },
  );

  server.tool(
    "stop_sandbox",
    `Tear down the preview sandbox for a session, quick task or project — the same Stop button the Eva UI has. Call this when you are finished with a chat you woke up, so the VM does not keep running after send_chat_message.

If a turn is in flight this is REJECTED rather than killing that turn: wait for it to finish and stop again, or cancel it deliberately with stop_agent first. An already-stopped sandbox is a no-op. The reply reports the settled state, which is "stopping" if teardown is still finishing.`,
    entityRefArgs,
    async (ref) => {
      const { userId } = await mcpGetContext(ctx, clerkUserId);
      const resolved = await resolveEntityTarget(ref, userId);
      if ("isError" in resolved) return resolved;
      const { target } = resolved;

      const result = await ctx.runAction(
        internal.mcp.nodeActions.mcpStopEntitySandbox,
        { clerkUserId, kind: target.kind, id: target.targetId },
      );

      return textResult({
        ...entitySummary(target),
        sandboxStatus: result.sandboxStatus,
        stopped: result.stopRequested,
      });
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // cancel_queued_message
  // ───────────────────────────────────────────────────────────────────────────

  server.tool(
    "cancel_queued_message",
    `Drop a follow-up that is still waiting in a chat's queue and has not started running. Use it to take back a message send_chat_message queued behind a busy turn.

This only removes queued messages. A turn that is already running is cancelled with stop_agent instead — this tool never interrupts one. Pass "queuedMessageId" for one message, or "all" to clear the whole pending queue; passing both is rejected.

A message the chat dequeued in the same instant is already running and cannot be taken back. The reply lists only what was still queued afterwards, so check "cancelled" rather than assuming.`,
    {
      ...entityRefArgs,
      queuedMessageId: z
        .string()
        .optional()
        .describe(
          "The queued message to cancel, as listed by get_agent_state. Omit only when passing all.",
        ),
      all: z
        .boolean()
        .default(false)
        .describe(
          "Cancel every message still pending on this chat instead of naming one.",
        ),
    },
    async ({ queuedMessageId, all, ...ref }) => {
      if (!all && queuedMessageId === undefined) {
        return errorResult(
          'Name what to cancel: pass "queuedMessageId", or "all": true to clear the pending queue.',
        );
      }
      if (all && queuedMessageId !== undefined) {
        return errorResult(
          'Pass "queuedMessageId" or "all", not both — cancelling one message and cancelling every message are different requests.',
        );
      }

      const { userId } = await mcpGetContext(ctx, clerkUserId);
      const resolved = await resolveEntityTarget(ref, userId);
      if ("isError" in resolved) return resolved;
      const { target } = resolved;

      const result = await ctx.runAction(
        internal.mcp.nodeActions.mcpCancelQueuedMessages,
        { clerkUserId, id: target.targetId, queuedMessageId, all },
      );

      return textResult({
        ...entitySummary(target),
        cancelled: result.cancelled,
        cancelledCount: result.cancelled.length,
        remaining: result.remaining,
      });
    },
  );
}
