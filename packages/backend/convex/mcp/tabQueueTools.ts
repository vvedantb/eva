import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { RESERVED_APP_TAB_SLUGS, slugifyAppTabName } from "../appTabSlug";
import {
  entityAccess,
  entityRefArgs,
  entitySummary,
  repoRefArgs,
  withSelfDefault,
  type EntityRef,
  type EntityTarget,
  type RepoRef,
} from "./entityRef";
import {
  confirmedDeleteArg,
  errorResult,
  guarded,
  mcpCallAsUser,
  mcpGetContext,
  textResult,
  type McpCredentials,
} from "./toolShared";
import { defineTool, type EvaTool } from "./registry";

/** Every public mutation below except appTabs:create returns `null`. */
const nullReply = z.null();

/** How much of a queued message's content list_queued_messages shows. */
const CONTENT_PREVIEW_CHARS = 300;

const queuedMessageRow = z.object({
  _id: z.string(),
  content: z.string(),
  displayContent: z.string().optional(),
  createdAt: z.number(),
  order: z.number().optional(),
  model: z.string().optional(),
  attachmentStorageIds: z.array(z.string()).optional(),
});
type QueuedMessageRow = z.infer<typeof queuedMessageRow>;

const appTabRow = z.object({
  _id: z.string(),
  repoId: z.string(),
  name: z.string(),
  icon: z.string(),
  port: z.number(),
  enabled: z.boolean(),
  order: z.number(),
});
type AppTabRow = z.infer<typeof appTabRow>;

type ToolError = ReturnType<typeof errorResult>;

/**
 * The settings UI stores the icon as a free-text Tabler component name and
 * renders unknown names as a placeholder. The backend cannot load Tabler's
 * name list, so this checks the shape every Tabler export has.
 */
const tablerIconArg = z
  .string()
  .trim()
  .regex(
    /^Icon[A-Z0-9][A-Za-z0-9]*$/,
    'Use a Tabler icon component name in PascalCase, e.g. "IconBolt" or "IconDatabase" (see https://tabler.io/icons).',
  )
  .describe(
    'Tabler icon component name, e.g. "IconBolt", "IconDatabase", "IconBrandSupabase" (see https://tabler.io/icons). An unknown name shows a placeholder icon.',
  );

const tabPortArg = z
  .number()
  .int()
  .min(1)
  .max(65535)
  .describe(
    "Port inside the chat's sandbox that the tab shows. Served through the same signed-in proxy as the Preview tab; external URLs are not supported.",
  );

const tabNameArg = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .describe(
    'Display name. Its slug becomes the tab\'s URL segment ("Supabase Studio" -> "supabase-studio"), so it must be unique in the repo and not a built-in tab (preview, editor, terminal, desktop, diffs, pr, prd).',
  );

const appTabIdArg = z
  .string()
  .describe("The tab id, as listed by list_app_tabs.");

const REPO_WIDE_NOTE =
  "Tabs are repo-wide: every session, quick task and project on that repo (for every teammate) sees them. Ask the user before adding, removing or disabling one unless they asked for it.";

function preview(text: string): string {
  return text.length > CONTENT_PREVIEW_CHARS
    ? `${text.slice(0, CONTENT_PREVIEW_CHARS)}… [${text.length - CONTENT_PREVIEW_CHARS} more characters]`
    : text;
}

function queuedMessageView(row: QueuedMessageRow, position: number) {
  return {
    id: row._id,
    position,
    contentPreview: preview(row.content),
    contentLength: row.content.length,
    ...(row.displayContent !== undefined
      ? { displayContent: preview(row.displayContent) }
      : {}),
    model: row.model,
    attachmentCount: row.attachmentStorageIds?.length ?? 0,
    createdAt: row.createdAt,
  };
}

function appTabView(tab: AppTabRow) {
  return {
    id: tab._id,
    name: tab.name,
    slug: slugifyAppTabName(tab.name),
    icon: tab.icon,
    port: tab.port,
    enabled: tab.enabled,
    order: tab.order,
  };
}

/** Mirrors appTabs.ts so a bad name fails before a round trip, with the same words. */
function appTabNameError(
  name: string,
  tabs: ReadonlyArray<AppTabRow>,
  excludeId?: string,
): string | null {
  const slug = slugifyAppTabName(name);
  if (!slug) return "Name must contain letters or numbers";
  if (RESERVED_APP_TAB_SLUGS.has(slug)) {
    return `"${name}" is reserved for a built-in tab`;
  }
  const conflict = tabs.find(
    (tab) => tab._id !== excludeId && slugifyAppTabName(tab.name) === slug,
  );
  return conflict ? `A tab named "${conflict.name}" already exists` : null;
}

/**
 * Tools for two things a chat shows that are not its transcript: the queue of
 * follow-ups waiting behind a busy turn, and the repo's custom sandbox tabs.
 *
 * Every read and write goes through the public Convex function the web UI
 * calls, as the MCP caller (mcpCallAsUser), so the UI's access checks apply.
 * Cancelling a queued message stays in entityTools (cancel_queued_message).
 */
export function tabQueueTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): EvaTool[] {
  const tools: EvaTool[] = [];
  const { clerkUserId } = credentials;
  const { assertUserRepoAccess, resolveRepoRef, resolveEntityTarget } =
    entityAccess(ctx, credentials);

  async function listQueue(target: EntityTarget): Promise<QueuedMessageRow[]> {
    return mcpCallAsUser(
      ctx,
      clerkUserId,
      {
        type: "query",
        path: "queuedMessages:listByParent",
        args: { parentId: target.targetId },
      },
      z.array(queuedMessageRow),
    );
  }

  /**
   * The repo a tab tool acts on: the one named, else the repo of the chat the
   * caller runs in. Access is the per-user check the web settings page uses.
   */
  async function resolveTabRepo(
    ref: RepoRef,
    userId: string,
  ): Promise<{ repoId: string } | ToolError> {
    if (ref.repoId !== undefined || ref.repoName !== undefined) {
      const repo = await resolveRepoRef(ref, userId);
      if ("isError" in repo) return repo;
      await assertUserRepoAccess(repo.repoId, userId);
      return repo;
    }
    const self = withSelfDefault<EntityRef>({}, credentials);
    if (self.id === undefined) {
      return errorResult(
        "Name the repo: pass repoId (from list_repos) or repoName.",
      );
    }
    const resolved = await resolveEntityTarget(self, userId);
    if ("isError" in resolved) return resolved;
    return { repoId: resolved.target.repoId };
  }

  async function listTabs(repoId: string): Promise<AppTabRow[]> {
    return mcpCallAsUser(
      ctx,
      clerkUserId,
      { type: "query", path: "appTabs:list", args: { repoId } },
      z.array(appTabRow),
    );
  }

  /** One tab, checked to belong to the resolved repo. */
  async function findTab(
    ref: RepoRef,
    tabId: string,
  ): Promise<
    { repoId: string; tab: AppTabRow; tabs: AppTabRow[] } | ToolError
  > {
    const { userId } = await mcpGetContext(ctx, clerkUserId);
    const repo = await resolveTabRepo(ref, userId);
    if ("isError" in repo) return repo;
    const tabs = await listTabs(repo.repoId);
    const tab = tabs.find((row) => row._id === tabId);
    if (tab === undefined) {
      return errorResult(
        "No tab with that id on this repo. Call list_app_tabs for the repo's tab ids, and pass repoName if the tab belongs to another repo.",
      );
    }
    return { repoId: repo.repoId, tab, tabs };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // list_queued_messages / edit_queued_message / reorder_queued_messages
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "list_queued_messages",
      description: `List the follow-ups waiting in a chat's queue, in the order they will run. Name no chat and it lists the one you are running in.

Each row has its id, 0-based "position" (0 runs next), a content preview, the model it will run on, its attachment count and createdAt. Pass these ids to edit_queued_message, reorder_queued_messages or cancel_queued_message.

The queue drains as turns finish, so a message listed here can start running at any moment and leave the queue.`,
      mutating: false,
      input: entityRefArgs,
      handler: async (ref) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const resolved = await resolveEntityTarget(
          withSelfDefault(ref, credentials),
          userId,
        );
        if ("isError" in resolved) return resolved;
        const { target } = resolved;

        const rows = await listQueue(target);
        const queued = rows.map(queuedMessageView);
        return textResult({
          ...entitySummary(target),
          queued,
          count: queued.length,
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "edit_queued_message",
      description: `Replace the text of a follow-up still waiting in a chat's queue, as the queue's edit button does. Name no chat and it acts on the one you are running in.

Only the content changes; the model, attachments and position stay. Pass the full new text, not a diff. A queued notification becomes a plain message once edited.

If the chat dequeued the message since you listed it, it is already running and the edit fails with "Queued message not found". Send a new follow-up with send_chat_message instead.`,
      mutating: true,
      input: {
        ...entityRefArgs,
        queuedMessageId: z
          .string()
          .describe("The queued message to edit, from list_queued_messages."),
        content: z
          .string()
          .trim()
          .min(1)
          .describe("The full replacement text."),
      },
      handler: async ({ queuedMessageId, content, ...ref }) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const resolved = await resolveEntityTarget(
          withSelfDefault(ref, credentials),
          userId,
        );
        if ("isError" in resolved) return resolved;
        const { target } = resolved;

        const rows = await listQueue(target);
        if (!rows.some((row) => row._id === queuedMessageId)) {
          return errorResult(
            "That message is not in this chat's queue. It may already have started running; call list_queued_messages to see what is still waiting.",
          );
        }

        return guarded(async () => {
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "mutation",
              path: "queuedMessages:update",
              args: { id: queuedMessageId, content },
            },
            nullReply,
          );
          return textResult({
            ...entitySummary(target),
            queuedMessageId,
            contentLength: content.length,
            status: "edited",
          });
        }, "The message may have started running since you listed it; call list_queued_messages to check.");
      },
    }),
  );

  tools.push(
    defineTool({
      name: "reorder_queued_messages",
      description: `Change the order a chat's queued follow-ups will run in, as dragging them in the queue does. Name no chat and it acts on the one you are running in.

Pass either "orderedIds" (every queued message id, top to bottom — the full current queue, nothing missing or extra) or "queuedMessageId" with "position" (0-based; 0 runs next) to move one message. Passing both is rejected.

If a message starts running between your list and this call, the reorder fails; list again and retry. The reply is the queue in its new order.`,
      mutating: true,
      input: {
        ...entityRefArgs,
        orderedIds: z
          .array(z.string())
          .min(1)
          .optional()
          .describe(
            "Every queued message id in the order they should run. Must match the current queue exactly.",
          ),
        queuedMessageId: z
          .string()
          .optional()
          .describe("One message to move. Use with position."),
        position: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Where to move queuedMessageId, 0-based (0 runs next). Past the end moves it last.",
          ),
      },
      handler: async ({ orderedIds, queuedMessageId, position, ...ref }) => {
        const movingOne =
          queuedMessageId !== undefined || position !== undefined;
        if (orderedIds !== undefined && movingOne) {
          return errorResult(
            'Pass "orderedIds" or "queuedMessageId" with "position", not both.',
          );
        }
        if (orderedIds === undefined && !movingOne) {
          return errorResult(
            'Pass "orderedIds" (the full queue in order) or "queuedMessageId" with "position".',
          );
        }

        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const resolved = await resolveEntityTarget(
          withSelfDefault(ref, credentials),
          userId,
        );
        if ("isError" in resolved) return resolved;
        const { target } = resolved;

        const rows = await listQueue(target);
        const currentIds = rows.map((row) => row._id);
        if (currentIds.length === 0) {
          return errorResult("This chat has nothing queued.");
        }

        let nextIds: string[];
        if (orderedIds !== undefined) {
          const current = new Set(currentIds);
          const requested = new Set(orderedIds);
          const foreign = orderedIds.filter((id) => !current.has(id));
          const missing = currentIds.filter((id) => !requested.has(id));
          if (requested.size !== orderedIds.length) {
            return errorResult("orderedIds lists the same message twice.");
          }
          if (foreign.length > 0 || missing.length > 0) {
            return errorResult(
              `orderedIds must be exactly this chat's current queue. ${foreign.length > 0 ? `Not in the queue (possibly already running): ${foreign.join(", ")}. ` : ""}${missing.length > 0 ? `Missing: ${missing.join(", ")}. ` : ""}Call list_queued_messages and retry.`,
            );
          }
          nextIds = orderedIds;
        } else {
          if (queuedMessageId === undefined || position === undefined) {
            return errorResult(
              'Moving one message needs both "queuedMessageId" and "position".',
            );
          }
          if (!currentIds.includes(queuedMessageId)) {
            return errorResult(
              "That message is not in this chat's queue. It may already have started running; call list_queued_messages to see what is still waiting.",
            );
          }
          nextIds = currentIds.filter((id) => id !== queuedMessageId);
          nextIds.splice(
            Math.min(position, nextIds.length),
            0,
            queuedMessageId,
          );
        }

        return guarded(async () => {
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "mutation",
              path: "queuedMessages:reorder",
              args: { parentId: target.targetId, orderedIds: nextIds },
            },
            nullReply,
          );
          const byId = new Map(rows.map((row) => [row._id, row]));
          const queued = nextIds.flatMap((id, index) => {
            const row = byId.get(id);
            return row === undefined ? [] : [queuedMessageView(row, index)];
          });
          return textResult({
            ...entitySummary(target),
            queued,
            status: "reordered",
          });
        }, "A message may have started running since you listed the queue; call list_queued_messages and retry.");
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // list_app_tabs / create_app_tab / update_app_tab / set_app_tab_enabled /
  // delete_app_tab
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "list_app_tabs",
      description: `List a repo's custom sandbox tabs (Settings > Tabs), enabled and disabled, in display order. Name no repo and it lists the repo of the chat you are running in.

A custom tab shows one port inside the chat's sandbox in its own tab, through the same signed-in proxy as Preview, at the chat's "/<slug>" route. Each row has id, name, slug, icon (a Tabler icon name), port, enabled and order. ${REPO_WIDE_NOTE}`,
      mutating: false,
      input: repoRefArgs,
      handler: async (ref) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const repo = await resolveTabRepo(ref, userId);
        if ("isError" in repo) return repo;
        const tabs = (await listTabs(repo.repoId)).map(appTabView);
        return textResult({ repoId: repo.repoId, tabs, count: tabs.length });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "create_app_tab",
      description: `Add a custom sandbox tab to a repo, appended after its existing tabs. Name no repo and it adds to the repo of the chat you are running in.

The tab shows a port inside the sandbox (e.g. a database studio or storybook the dev setup starts), not an external website. ${REPO_WIDE_NOTE} The reply is the new tab.`,
      mutating: true,
      input: {
        ...repoRefArgs,
        name: tabNameArg,
        icon: tablerIconArg,
        port: tabPortArg,
        enabled: z
          .boolean()
          .default(true)
          .describe("Show the tab on chats straight away (default true)."),
      },
      handler: async ({ name, icon, port, enabled, ...ref }) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const repo = await resolveTabRepo(ref, userId);
        if ("isError" in repo) return repo;
        const tabs = await listTabs(repo.repoId);
        const nameError = appTabNameError(name, tabs);
        if (nameError !== null) return errorResult(nameError);

        return guarded(async () => {
          const id = await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "mutation",
              path: "appTabs:create",
              args: { repoId: repo.repoId, name, icon, port, enabled },
            },
            z.string(),
          );
          return textResult({
            repoId: repo.repoId,
            tab: {
              id,
              name,
              slug: slugifyAppTabName(name),
              icon,
              port,
              enabled,
            },
            status: "created",
          });
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "update_app_tab",
      description: `Change a custom sandbox tab's name, icon or port. Fields you omit keep their value. Renaming changes the tab's URL slug, so open links to the old slug stop working.

Name no repo and it looks for the tab on the repo of the chat you are running in. ${REPO_WIDE_NOTE} Use set_app_tab_enabled to show or hide a tab.`,
      mutating: true,
      input: {
        ...repoRefArgs,
        tabId: appTabIdArg,
        name: tabNameArg.optional(),
        icon: tablerIconArg.optional(),
        port: tabPortArg.optional(),
      },
      handler: async ({ tabId, name, icon, port, ...ref }) => {
        if (name === undefined && icon === undefined && port === undefined) {
          return errorResult('Pass at least one of "name", "icon" or "port".');
        }
        const found = await findTab(ref, tabId);
        if ("isError" in found) return found;
        const { tab, tabs } = found;
        if (name !== undefined) {
          const nameError = appTabNameError(name, tabs, tab._id);
          if (nameError !== null) return errorResult(nameError);
        }

        const next = {
          id: tab._id,
          name: name ?? tab.name,
          icon: icon ?? tab.icon,
          port: port ?? tab.port,
        };
        return guarded(async () => {
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            { type: "mutation", path: "appTabs:update", args: next },
            nullReply,
          );
          return textResult({
            repoId: found.repoId,
            tab: appTabView({ ...tab, ...next }),
            status: "updated",
          });
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "set_app_tab_enabled",
      description: `Show or hide a custom sandbox tab on chats without deleting it, as the switch in Settings > Tabs does. Name no repo and it looks for the tab on the repo of the chat you are running in.

${REPO_WIDE_NOTE}`,
      mutating: true,
      input: {
        ...repoRefArgs,
        tabId: appTabIdArg,
        enabled: z
          .boolean()
          .describe("true shows the tab on chats; false hides it."),
      },
      handler: async ({ tabId, enabled, ...ref }) => {
        const found = await findTab(ref, tabId);
        if ("isError" in found) return found;
        return guarded(async () => {
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "mutation",
              path: "appTabs:toggleEnabled",
              args: { id: found.tab._id, enabled },
            },
            nullReply,
          );
          return textResult({
            repoId: found.repoId,
            tab: appTabView({ ...found.tab, enabled }),
            status: enabled ? "enabled" : "disabled",
          });
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "delete_app_tab",
      description: `Delete a custom sandbox tab from a repo. It disappears from every chat on that repo for the whole team and cannot be undone (recreate it with create_app_tab). To hide it for now, use set_app_tab_enabled instead.

Name no repo and it looks for the tab on the repo of the chat you are running in. Ask the user in chat before calling, and pass confirmed: true only after they say yes.`,
      mutating: true,
      input: {
        ...repoRefArgs,
        tabId: appTabIdArg,
        confirmed: confirmedDeleteArg,
      },
      handler: async ({ tabId, ...ref }) => {
        const found = await findTab(ref, tabId);
        if ("isError" in found) return found;
        return guarded(async () => {
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "mutation",
              path: "appTabs:remove",
              args: { id: found.tab._id },
            },
            nullReply,
          );
          return textResult({
            repoId: found.repoId,
            tabId: found.tab._id,
            name: found.tab.name,
            status: "deleted",
          });
        });
      },
    }),
  );

  return tools;
}
