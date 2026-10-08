import { internalQuery, type QueryCtx } from "../_generated/server";
import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { prStateValidator } from "../validators";
import { mcpPullRequestValidator, toMcpPullRequests } from "./queries";
import {
  listOwnerPullRequests,
  sessionRepoPullRequest,
  taskPrUrl,
  type PrOwnerRef,
} from "../_pullRequests/store";
import { slugifyAppTabName } from "../appTabSlug";
import { previewConsoleSessionName } from "../_pty/consoleSessionName";

// Backs the chat-self MCP tools (chatSelfTools.ts). Internal on purpose: the
// tool has already resolved the chat through `resolveEntityTarget`, which is
// where the per-user access check lives, so this only reads what it was named.

const chatKindValidator = v.union(
  v.literal("session"),
  v.literal("task"),
  v.literal("project"),
);

const chatDetailsValidator = v.object({
  baseBranch: v.optional(v.string()),
  prUrl: v.optional(v.string()),
  prState: v.optional(prStateValidator),
  devPort: v.optional(v.number()),
  devCommand: v.optional(v.string()),
  previewPath: v.optional(v.string()),
  /** `session-<id>` / `task-<id>` / `project-<id>`, the Console launcher's owner key. */
  ownerKey: v.string(),
  consoleTmuxSession: v.string(),
  repoRootDirectory: v.optional(v.string()),
  repoTeamId: v.optional(v.id("teams")),
  startupCommands: v.array(v.string()),
  backgroundCommands: v.array(v.string()),
  vncEnabled: v.boolean(),
  vscodeEnabled: v.boolean(),
  customTabs: v.array(
    v.object({
      name: v.string(),
      slug: v.string(),
      port: v.number(),
      enabled: v.boolean(),
    }),
  ),
  /** Every PR linked to the chat, primary first, then newest first. */
  pullRequests: v.array(mcpPullRequestValidator),
  linkedRepos: v.array(
    v.object({
      repo: v.string(),
      path: v.string(),
      branch: v.string(),
      baseBranch: v.string(),
      prUrl: v.optional(v.string()),
      prState: v.optional(prStateValidator),
      devPort: v.optional(v.number()),
      devCommand: v.optional(v.string()),
    }),
  ),
});

export type ChatDetails = Infer<typeof chatDetailsValidator>;

type ChatOwnerFields = Pick<
  ChatDetails,
  "baseBranch" | "prUrl" | "prState" | "devPort" | "devCommand" | "previewPath"
> & { ownerKey: string; owner: PrOwnerRef };

/** The per-surface fields; everything else is shared repo config. */
async function ownerFields(
  ctx: QueryCtx,
  kind: Infer<typeof chatKindValidator>,
  id: string,
): Promise<ChatOwnerFields | null> {
  if (kind === "session") {
    const sessionId = ctx.db.normalizeId("sessions", id);
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    if (!session) return null;
    return {
      owner: { kind: "session", sessionId: session._id },
      ownerKey: `session-${session._id}`,
      baseBranch: session.baseBranch,
      prUrl: session.prUrl,
      prState: session.prState,
      devPort: session.devPort,
      devCommand: session.devCommand,
      previewPath: session.previewPath,
    };
  }
  if (kind === "task") {
    const taskId = ctx.db.normalizeId("agentTasks", id);
    const task = taskId ? await ctx.db.get(taskId) : null;
    if (!task) return null;
    return {
      owner: { kind: "task", taskId: task._id },
      ownerKey: `task-${task._id}`,
      baseBranch: task.baseBranch,
      prUrl: await taskPrUrl(ctx.db, task),
      prState: task.prState,
      devPort: task.devPort,
      devCommand: task.devCommand,
      previewPath: task.previewPath,
    };
  }
  const projectId = ctx.db.normalizeId("projects", id);
  const project = projectId ? await ctx.db.get(projectId) : null;
  if (!project) return null;
  return {
    owner: { kind: "project", projectId: project._id },
    ownerKey: `project-${project._id}`,
    baseBranch: project.baseBranch,
    prUrl: project.prUrl,
    prState: project.prState,
    devPort: project.devPort,
    devCommand: project.devCommand,
    previewPath: project.previewPath,
  };
}

function linkedRepoRow(
  link: Doc<"sessionRepos">,
  prs: readonly Doc<"pullRequests">[],
) {
  const pr = sessionRepoPullRequest(prs, link._id);
  return {
    repo: `${link.owner}/${link.name}`,
    path: link.path,
    branch: link.branchName,
    baseBranch: link.baseBranch,
    prUrl: pr?.prUrl,
    prState: pr?.state,
    devPort: link.devPort,
    devCommand: link.devCommand,
  };
}

/**
 * Everything `get_chat_context`, `get_dev_server_logs` and
 * `restart_dev_server` need about one chat beyond what `resolveEntityTarget`
 * returns. The entity's own dev port/command win over the repo defaults, the
 * same precedence the Preview pane uses.
 */
export const getChatDetails = internalQuery({
  args: {
    kind: chatKindValidator,
    id: v.string(),
    /** The repo `resolveEntityTarget` settled on (a project task's comes from its project). */
    repoId: v.id("githubRepos"),
  },
  returns: v.union(v.null(), chatDetailsValidator),
  handler: async (ctx, { kind, id, repoId }): Promise<ChatDetails | null> => {
    const fields = await ownerFields(ctx, kind, id);
    if (!fields) return null;
    const { owner: prOwner, ...owner } = fields;
    const prs = await listOwnerPullRequests(ctx.db, prOwner);
    const repo = await ctx.db.get(repoId);
    if (!repo) return null;

    const tabs = await ctx.db
      .query("appTabs")
      .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
      .collect();
    const sessionId =
      kind === "session" ? ctx.db.normalizeId("sessions", id) : null;
    const links = sessionId
      ? await ctx.db
          .query("sessionRepos")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .collect()
      : [];

    return {
      ...owner,
      devPort: owner.devPort ?? repo.devPort,
      devCommand: owner.devCommand ?? repo.devCommand,
      consoleTmuxSession: previewConsoleSessionName(owner.ownerKey),
      repoRootDirectory: repo.rootDirectory,
      repoTeamId: repo.teamId,
      startupCommands: repo.startupCommands ?? [],
      backgroundCommands: repo.backgroundCommands ?? [],
      vncEnabled: repo.sessionsVncEnabled === true,
      vscodeEnabled: repo.sessionsVscodeEnabled === true,
      customTabs: tabs
        .sort((a, b) => a.order - b.order)
        .map((tab) => ({
          name: tab.name,
          slug: slugifyAppTabName(tab.name),
          port: tab.port,
          enabled: tab.enabled,
        })),
      pullRequests: toMcpPullRequests(prs),
      linkedRepos: links.map((link) => linkedRepoRow(link, prs)),
    };
  },
});
