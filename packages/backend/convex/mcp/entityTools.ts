import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  ENTITY_KINDS,
  entityAccess,
  entityPath,
  entityPreviewPath,
  entityRefArgs,
  entitySummary,
  repoRefArgs,
  type EntityLocation,
  type EntityRef,
} from "./entityRef";
import {
  errorResult,
  mcpGetContext,
  mcpListUserRepos,
  textResult,
  type McpCredentials,
} from "./toolShared";
import { defineTool, type EvaTool } from "./registry";
import { getEvaBaseUrl } from "../_taskWorkflow/urls";
import { PREVIEW_GRANT_PARAM } from "../previewGrantConfig";

/** Port the Preview pane falls back to when nothing recorded a dev port. */
const DEFAULT_PREVIEW_PORT = 3000;

/**
 * Turns a live preview URL into one that is safe to hand a person: the grant
 * param is a five-minute bearer token, so it must never be persisted or shared
 * (same rule the web app's "open in new tab" follows). Without it the proxy
 * bounces the opener through Eva sign-in and back.
 *
 * `path` replaces the route while keeping any query the proxy put there.
 */
function shareablePreviewUrl(rawUrl: string, path?: string): string {
  const url = new URL(rawUrl);
  url.searchParams.delete(PREVIEW_GRANT_PARAM);
  if (path !== undefined && path.trim().length > 0) {
    const trimmed = path.trim();
    const target = new URL(
      trimmed.startsWith("/") ? trimmed : `/${trimmed}`,
      url.origin,
    );
    url.pathname = target.pathname;
    url.hash = target.hash;
    for (const [key, value] of target.searchParams) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/**
 * The permanent Eva page for a chat's Preview tab, for a caller who would
 * rather open it in Eva than hit the sandbox directly. Omitted rather than
 * thrown when the chat has no number yet or the deployment has no web app
 * configured — a missing second link must not cost the caller the first one.
 */
function evaPreviewUrl(location: EntityLocation): { evaUrl?: string } {
  const previewPath = entityPreviewPath(location);
  if (previewPath === undefined) return {};
  try {
    return { evaUrl: `${getEvaBaseUrl()}${previewPath}` };
  } catch {
    return {};
  }
}

/**
 * Tools that inspect and operate the chats a caller already has: what exists,
 * whether its preview VM is up, where that VM is serving the app, and what is
 * still waiting in its queue.
 *
 * Deliberately absent: anything that patches a session, task or project's
 * status or review state. Those stay a person's call, so an agent can drive a
 * sandbox without also moving work through the board.
 */
export function entityTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): EvaTool[] {
  const tools: EvaTool[] = [];
  const { clerkUserId, entityId, entityKind } = credentials;
  // Chat tools use the per-user check only: every chat the user can open in
  // Eva is reachable, whichever repo minted the token (see entityAccess).
  const { assertUserRepoAccess, resolveRepoRef, resolveEntityTarget } =
    entityAccess(ctx, credentials);

  // ───────────────────────────────────────────────────────────────────────────
  // list_entities
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "list_entities",
      description: `List the Eva sessions, quick tasks and projects you can reach, most recently updated first. Use it to find something that already exists — and to avoid creating a second copy of work that is already in flight.

Each row carries the Convex "id" and "numId" that send_chat_message, start_sandbox and cancel_queued_message accept, plus "status", "sandboxStatus", "isExecuting" and "prUrl" so you can tell what is safe to merge, retry or leave alone.

Only entities you could already open in Eva are returned. The page is capped; "truncated" is true when more matched than fit. Listing is per repo, so a project's child task that has no repo of its own is not listed — reach it by id instead.`,
      mutating: false,
      input: {
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
      handler: async ({ kind, status, limit, repoId, repoName, app }) => {
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
          // Only sessions carry this, and only when they have linked repos.
          ...(entity.linkedRepoCount
            ? { linkedRepoCount: entity.linkedRepoCount }
            : {}),
        }));

        return textResult({
          entities,
          count: entities.length,
          truncated: result.truncated,
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // start_sandbox / stop_sandbox
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "start_sandbox",
      description: `Start the preview sandbox for a session, quick task or project — the same Start button the Eva UI has. Returns only once the VM is genuinely active, or fails saying why; it never leaves you guessing at "resuming sandbox".

Already-active sandboxes are left alone. Each surface has its own gate: a quick task must be in code_review, business_review or done, and a project must be in in_progress, business_review or code_review, before a preview sandbox will start.`,
      mutating: true,
      input: entityRefArgs,
      handler: async (ref) => {
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
    }),
  );

  tools.push(
    defineTool({
      name: "stop_sandbox",
      description: `Tear down the preview sandbox for a session, quick task or project — the same Stop button the Eva UI has. Call this when you are finished with a chat you woke up, so the VM does not keep running after send_chat_message.

If a turn is in flight this is REJECTED rather than killing that turn: wait for it to finish and stop again, or cancel it deliberately with stop_agent first. An already-stopped sandbox is a no-op. The reply reports the settled state, which is "stopping" if teardown is still finishing.`,
      mutating: true,
      input: entityRefArgs,
      handler: async (ref) => {
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
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // get_preview_url
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * An agent asked "what is my preview link?" has no id for itself, and used to
   * answer that no link existed. Naming no chat therefore means "the one I am
   * running in", which the sandbox token already states.
   */
  const withSelfDefault = (ref: EntityRef): EntityRef => {
    const named =
      ref.id !== undefined ||
      ref.prUrl !== undefined ||
      ref.numId !== undefined;
    if (named || entityId === undefined || entityKind === undefined) return ref;
    return { ...ref, id: entityId, kind: entityKind };
  };

  tools.push(
    defineTool({
      name: "get_preview_url",
      description: `The live web address of a chat's running app — the same thing the Preview tab shows. Call this whenever the user asks for "the link", "the preview", "the URL" or wants to open what you just built; do not tell them no link exists until this has said so.

Name no chat and it answers for the one you are running in. "path" points the link at a route you built, e.g. "/demo/referral-portal".

The returned "previewUrl" is served straight from the sandbox, so it only works while that sandbox is running, and opening it requires an Eva login — it is for the user and their team, not a public address. "evaUrl" is the permanent Eva page holding the same preview. When the sandbox is not running there is no previewUrl: "sandboxStatus" says so, and start_sandbox brings it up. A "ready" of false means the VM is up but the dev server is still compiling — wait and call again.`,
      mutating: false,
      input: {
        ...entityRefArgs,
        path: z
          .string()
          .optional()
          .describe(
            'Route to open, e.g. "/demo/referral-portal". Defaults to the app root.',
          ),
      },
      handler: async ({ path, ...ref }) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const chatRef = withSelfDefault(ref);
        const resolved = await resolveEntityTarget(chatRef, userId);
        if ("isError" in resolved) return resolved;
        const { target } = resolved;

        const summary = {
          ...entitySummary(target),
          sandboxStatus: target.sandboxStatus,
          ...evaPreviewUrl(target),
        };

        if (
          target.sandboxId === undefined ||
          target.sandboxStatus !== "active"
        ) {
          return textResult({
            ...summary,
            previewUrl: null,
            ready: false,
            note: `This ${target.kind}'s sandbox is "${target.sandboxStatus}", so nothing is being served. Call start_sandbox and try again.`,
          });
        }

        const preview = await ctx.runAction(
          internal.sandbox.previewUrlForAuthorizedSandbox,
          {
            clerkUserId,
            sandboxId: target.sandboxId,
            repoId: target.repoId,
            port: target.devPort ?? DEFAULT_PREVIEW_PORT,
            checkReady: true,
          },
        );

        // An unreachable dev server comes back as an empty url, not an error.
        if (preview.url.length === 0) {
          return textResult({
            ...summary,
            previewUrl: null,
            ready: false,
            port: preview.port,
            note: "The sandbox is not serving anything on the app port yet. Eva restarts the dev server automatically; wait a minute and call again.",
          });
        }

        return textResult({
          ...summary,
          previewUrl: shareablePreviewUrl(preview.url, path),
          port: preview.port,
          ready: preview.ready,
          ...(preview.ready
            ? {}
            : {
                note: "The dev server has not answered yet (a cold compile takes 1-2 minutes). The link is right; it may need a retry.",
              }),
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // cancel_queued_message
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "cancel_queued_message",
      description: `Drop a follow-up that is still waiting in a chat's queue and has not started running. Use it to take back a message send_chat_message queued behind a busy turn.

This only removes queued messages. A turn that is already running is cancelled with stop_agent instead — this tool never interrupts one. Pass "queuedMessageId" for one message, or "all" to clear the whole pending queue; passing both is rejected.

A message the chat dequeued in the same instant is already running and cannot be taken back. The reply lists only what was still queued afterwards, so check "cancelled" rather than assuming.`,
      mutating: true,
      input: {
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
      handler: async ({ queuedMessageId, all, ...ref }) => {
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
    }),
  );

  return tools;
}
