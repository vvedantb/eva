import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  authMutation,
  authQuery,
  hasTeamAccess,
} from "./functions";
import { createNotification } from "./notifications";
import { isEntityDeleted } from "./numId";
import {
  startNextQueuedProjectChatMessage,
  startNextQueuedSessionMessage,
  startNextQueuedTaskChatMessage,
} from "./_queues/helpers";
import { listDirectoryForTeam, teamHasOtherMembers } from "./workProfiles";
import {
  DEFAULT_AI_MODEL,
  roleUserValidator,
  routedSourceKindValidator,
  routedThreadStatusValidator,
} from "./validators";
import type { Infer } from "convex/values";

type SourceKind = Infer<typeof routedSourceKindValidator>;
type ThreadStatus = Infer<typeof routedThreadStatusValidator>;

const OPEN_STATUSES: ReadonlySet<ThreadStatus> = new Set([
  "open",
  "waiting_human",
  "waiting_eva",
]);

const threadSummary = v.object({
  _id: v.id("routedThreads"),
  teamId: v.id("teams"),
  repoId: v.id("githubRepos"),
  participants: v.array(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      needsReply: v.boolean(),
    }),
  ),
  /** True when the caller is a participant Eva is still waiting on. */
  needsMyReply: v.boolean(),
  sourceOwnerUserId: v.optional(v.id("users")),
  sourceKind: routedSourceKindValidator,
  sourceId: v.string(),
  sourceNumId: v.optional(v.number()),
  sourceTitle: v.string(),
  sourceHref: v.optional(v.string()),
  topicKey: v.string(),
  title: v.string(),
  status: routedThreadStatusValidator,
  lastMessageAt: v.number(),
  lastPreview: v.string(),
  createdAt: v.number(),
  resolvedAt: v.optional(v.number()),
});

const messageSummary = v.object({
  _id: v.id("routedMessages"),
  threadId: v.id("routedThreads"),
  authorKind: v.union(v.literal("eva"), v.literal("user")),
  authorUserId: v.optional(v.id("users")),
  authorName: v.optional(v.string()),
  body: v.string(),
  context: v.optional(v.string()),
  createdAt: v.number(),
});

function normalizeTopicKey(raw: string): string {
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "question";
}

function previewOf(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed;
}

function titleOf(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ");
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
}

/** A title quoted mid-sentence keeps its own punctuation out of ours. */
function quotedTitle(question: string): string {
  return `"${titleOf(question).replace(/[.?!]+$/, "")}"`;
}

function sourceKindLabel(kind: SourceKind): string {
  if (kind === "session") return "Session";
  if (kind === "task") return "Task";
  return "Project";
}

function clipContext(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** Briefing the teammate sees above Eva's question. */
function composeAskContext(
  agentContext: string,
  source: SourceRecord,
  ownerName: string,
  latestUser?: string,
): string {
  const kind = sourceKindLabel(source.sourceKind);
  const ref =
    source.numId !== undefined ? `${kind} ${source.numId}` : kind;
  const sourceLine = `${ref} · ${source.title} · opened by ${ownerName}`;
  const parts = [agentContext.trim(), sourceLine];
  if (latestUser) {
    parts.push(`What they asked Eva to do:\n${clipContext(latestUser, 400)}`);
  }
  return parts.join("\n\n");
}

async function latestUserRequest(
  ctx: QueryCtx,
  sourceId: string,
): Promise<string | undefined> {
  const parentId =
    ctx.db.normalizeId("sessions", sourceId) ??
    ctx.db.normalizeId("agentTasks", sourceId) ??
    ctx.db.normalizeId("projects", sourceId);
  if (!parentId) return undefined;
  const rows = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .order("desc")
    .take(30);
  const user = rows.find(
    (row) =>
      row.role === "user" &&
      row.isSystemAlert !== true &&
      row.content.trim().length > 0,
  );
  return user?.content.trim();
}

function displayName(user: {
  fullName?: string;
  firstName?: string;
  email?: string;
} | null): string {
  if (!user) return "Teammate";
  return user.fullName || user.firstName || user.email || "Teammate";
}

function repoHref(
  owner: string,
  name: string,
  rootDirectory?: string,
): string {
  if (!rootDirectory) return `/${owner}/${name}`;
  const appName = rootDirectory.split("/").pop();
  return `/${owner}/${name}/${appName}`;
}

function sourceHref(
  repo: { owner: string; name: string; rootDirectory?: string },
  kind: SourceKind,
  numId: number | undefined,
): string | undefined {
  if (numId === undefined) return undefined;
  const base = repoHref(repo.owner, repo.name, repo.rootDirectory);
  if (kind === "session") return `${base}/sessions/${numId}`;
  if (kind === "task") return `${base}/quick-tasks/${numId}`;
  return `${base}/projects/${numId}`;
}

type SourceRecord = {
  sourceKind: SourceKind;
  sourceId: string;
  repoId: Id<"githubRepos">;
  numId: number | undefined;
  title: string;
  ownerUserId: Id<"users">;
  lastModel: Doc<"sessions">["lastModel"];
  deleted: boolean;
  archived: boolean;
};

async function loadSource(
  ctx: QueryCtx,
  sourceKind: SourceKind,
  sourceId: string,
): Promise<SourceRecord | null> {
  if (sourceKind === "session") {
    const id = ctx.db.normalizeId("sessions", sourceId);
    if (!id) return null;
    const session = await ctx.db.get(id);
    if (!session) return null;
    return {
      sourceKind,
      sourceId: id,
      repoId: session.repoId,
      numId: session.numId,
      title: session.title,
      ownerUserId: session.userId,
      lastModel: session.lastModel,
      deleted: isEntityDeleted(session),
      archived: session.archived === true,
    };
  }
  if (sourceKind === "task") {
    const id = ctx.db.normalizeId("agentTasks", sourceId);
    if (!id) return null;
    const task = await ctx.db.get(id);
    if (!task) return null;
    let repoId = task.repoId;
    if (!repoId && task.projectId) {
      const project = await ctx.db.get(task.projectId);
      repoId = project?.repoId;
    }
    if (!repoId) return null;
    return {
      sourceKind,
      sourceId: id,
      repoId,
      numId: task.numId,
      title: task.title,
      ownerUserId: task.createdBy,
      lastModel: undefined,
      deleted: isEntityDeleted(task),
      archived: false,
    };
  }
  const id = ctx.db.normalizeId("projects", sourceId);
  if (!id) return null;
  const project = await ctx.db.get(id);
  if (!project) return null;
  return {
    sourceKind,
    sourceId: id,
    repoId: project.repoId,
    numId: project.numId,
    title: project.title,
    ownerUserId: project.userId,
    lastModel: undefined,
    deleted: isEntityDeleted(project),
    archived: false,
  };
}

async function enrichThread(
  ctx: QueryCtx,
  thread: Doc<"routedThreads">,
  viewerUserId: Id<"users">,
) {
  const rows = await threadParticipants(ctx, thread._id);
  const participants = [];
  let needsMyReply = false;
  for (const row of rows) {
    const user = await ctx.db.get(row.userId);
    participants.push({
      userId: row.userId,
      name: displayName(user),
      needsReply: row.needsReply,
    });
    if (row.userId === viewerUserId && row.needsReply) needsMyReply = true;
  }
  // Stable order for the UI — row order is insertion order, which shuffles as
  // people are added to an existing thread.
  participants.sort((a, b) => a.name.localeCompare(b.name));
  const repo = await ctx.db.get(thread.repoId);
  const source = await loadSource(ctx, thread.sourceKind, thread.sourceId);
  return {
    _id: thread._id,
    teamId: thread.teamId,
    repoId: thread.repoId,
    participants,
    needsMyReply,
    sourceOwnerUserId: source?.ownerUserId,
    sourceKind: thread.sourceKind,
    sourceId: thread.sourceId,
    sourceNumId: thread.sourceNumId,
    sourceTitle: thread.sourceTitle,
    sourceHref: repo
      ? sourceHref(repo, thread.sourceKind, thread.sourceNumId)
      : undefined,
    topicKey: thread.topicKey,
    title: thread.title,
    status: thread.status,
    lastMessageAt: thread.lastMessageAt,
    lastPreview: thread.lastPreview,
    createdAt: thread.createdAt,
    resolvedAt: thread.resolvedAt,
  };
}

async function assertThreadRead(
  ctx: QueryCtx,
  threadId: Id<"routedThreads">,
  userId: Id<"users">,
) {
  const thread = await ctx.db.get(threadId);
  if (!thread) throw new Error("Thread not found");
  if (!(await hasTeamAccess(ctx.db, thread.teamId, userId))) {
    throw new Error("Not authorized");
  }
  return thread;
}

async function participantRow(
  ctx: QueryCtx,
  threadId: Id<"routedThreads">,
  userId: Id<"users">,
): Promise<Doc<"routedParticipants"> | null> {
  return await ctx.db
    .query("routedParticipants")
    .withIndex("by_thread_and_user", (q) =>
      q.eq("threadId", threadId).eq("userId", userId),
    )
    .first();
}

async function canWriteThread(
  ctx: QueryCtx,
  thread: Doc<"routedThreads">,
  userId: Id<"users">,
): Promise<boolean> {
  if (await participantRow(ctx, thread._id, userId)) return true;
  const source = await loadSource(ctx, thread.sourceKind, thread.sourceId);
  return source?.ownerUserId === userId;
}

async function threadParticipants(
  ctx: QueryCtx,
  threadId: Id<"routedThreads">,
): Promise<Doc<"routedParticipants">[]> {
  return await ctx.db
    .query("routedParticipants")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .collect();
}

function notifyEntityArgs(
  source: SourceRecord,
): {
  sessionId?: Id<"sessions">;
  taskId?: Id<"agentTasks">;
  projectId?: Id<"projects">;
} {
  if (source.sourceKind === "session") {
    return { sessionId: source.sourceId as Id<"sessions"> };
  }
  if (source.sourceKind === "task") {
    return { taskId: source.sourceId as Id<"agentTasks"> };
  }
  return { projectId: source.sourceId as Id<"projects"> };
}

async function insertSystemAlert(
  ctx: MutationCtx,
  source: SourceRecord,
  content: string,
): Promise<Id<"messages"> | undefined> {
  const parentId =
    source.sourceKind === "session"
      ? (source.sourceId as Id<"sessions">)
      : source.sourceKind === "task"
        ? (source.sourceId as Id<"agentTasks">)
        : (source.sourceId as Id<"projects">);
  return await ctx.db.insert("messages", {
    parentId,
    role: "assistant",
    content,
    timestamp: Date.now(),
    isSystemAlert: true,
  });
}

async function enqueueSourceWake(
  ctx: MutationCtx,
  source: SourceRecord,
  userId: Id<"users">,
  content: string,
  displayContent: string,
): Promise<void> {
  if (source.deleted || source.archived) return;
  const parentId =
    source.sourceKind === "session"
      ? (source.sourceId as Id<"sessions">)
      : source.sourceKind === "task"
        ? (source.sourceId as Id<"agentTasks">)
        : (source.sourceId as Id<"projects">);
  const now = Date.now();
  await ctx.db.insert("queuedMessages", {
    parentId,
    content,
    displayContent,
    createdAt: now,
    order: now,
    userId,
    model: source.lastModel ?? DEFAULT_AI_MODEL,
  });
  if (source.sourceKind === "session") {
    await startNextQueuedSessionMessage(ctx, parentId as Id<"sessions">);
  } else if (source.sourceKind === "task") {
    await startNextQueuedTaskChatMessage(ctx, parentId as Id<"agentTasks">);
  } else {
    await startNextQueuedProjectChatMessage(ctx, parentId as Id<"projects">);
  }
}

type DirectoryMember = {
  userId: Id<"users">;
  name: string;
  role: "business" | "dev" | "designer" | null;
};

/**
 * Who Eva is asking. A role with several matches is no longer ambiguous: the
 * whole role gets the question, which is what a group thread is for.
 */
async function resolveParticipants(
  ctx: QueryCtx,
  args: {
    teamId: Id<"teams">;
    actorUserId: Id<"users">;
    userIds?: Id<"users">[];
    role?: "business" | "dev" | "designer";
  },
): Promise<
  | { ok: true; users: DirectoryMember[] }
  | { ok: false; error: string; candidates?: DirectoryMember[] }
> {
  const directory = await listDirectoryForTeam(ctx, args.teamId);
  let chosen: DirectoryMember[];
  if (args.userIds && args.userIds.length > 0) {
    chosen = [];
    for (const userId of new Set(args.userIds)) {
      const match = directory.find((row) => row.userId === userId);
      if (!match) {
        return { ok: false, error: `That person (${userId}) is not on this team.` };
      }
      chosen.push(match);
    }
  } else if (args.role) {
    chosen = directory.filter((row) => row.role === args.role);
    if (chosen.length === 0) {
      return {
        ok: false,
        error: `No teammate with role "${args.role}" on this team. Ask in the session chat instead.`,
      };
    }
  } else {
    return {
      ok: false,
      error:
        "Pass userIds or role (business, dev, designer). Call list_work_profiles first.",
    };
  }
  // The person driving the source chat must never be asked their own question.
  const others = chosen.filter((row) => row.userId !== args.actorUserId);
  if (others.length === 0) {
    return {
      ok: false,
      error: "You are the only match. Name someone else to ask.",
    };
  }
  return { ok: true, users: others };
}

type AskGate =
  | {
      ok: true;
      source: SourceRecord;
      repo: Doc<"githubRepos">;
      teamId: Id<"teams">;
    }
  | { ok: false; error: string };

/**
 * Everything that must hold before anyone is picked. `ask` and `candidatesFor`
 * share it so the agent sees the same refusal whichever it calls first.
 */
async function gateAsk(
  ctx: QueryCtx,
  actorUserId: Id<"users">,
  sourceKind: SourceKind,
  sourceId: string,
): Promise<AskGate> {
  const source = await loadSource(ctx, sourceKind, sourceId);
  if (!source) return { ok: false, error: "Source chat was not found." };
  if (source.deleted || source.archived) {
    return { ok: false, error: "The source chat is archived. Ask in chat." };
  }
  const repo = await ctx.db.get(source.repoId);
  if (!repo?.teamId) {
    return {
      ok: false,
      error: "This repo is not on a team. Ask in the session chat.",
    };
  }
  const team = await ctx.db.get(repo.teamId);
  if (!team) {
    return {
      ok: false,
      error: "This repo is not on a team. Ask in the session chat.",
    };
  }
  // Count members rather than reading `team.isPersonal`: a team can be flagged
  // personal and still have several people on it (that is the main working team
  // in production), so the flag does not answer "is there anyone to ask".
  if (!(await teamHasOtherMembers(ctx, team._id, actorUserId))) {
    return {
      ok: false,
      error: "Nobody else is on this team to ask. Ask in the session chat instead.",
    };
  }
  if (!(await hasTeamAccess(ctx.db, repo.teamId, actorUserId))) {
    return { ok: false, error: "Not authorized for this team's repo." };
  }
  return { ok: true, source, repo, teamId: repo.teamId };
}

export const listMine = authQuery({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("all"))),
  },
  returns: v.array(threadSummary),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("routedParticipants")
      .withIndex("by_user_and_lastMessage", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(80);
    const out = [];
    for (const row of rows) {
      const thread = await ctx.db.get(row.threadId);
      if (!thread) continue;
      if (!(await hasTeamAccess(ctx.db, thread.teamId, ctx.userId))) continue;
      if (args.status !== "all" && !OPEN_STATUSES.has(thread.status)) continue;
      out.push(await enrichThread(ctx, thread, ctx.userId));
    }
    return out;
  },
});

export const listTeam = authQuery({
  args: {
    teamId: v.optional(v.id("teams")),
    status: v.optional(v.union(v.literal("open"), v.literal("all"))),
  },
  returns: v.array(threadSummary),
  handler: async (ctx, args) => {
    let teamId = args.teamId;
    if (!teamId) {
      const memberships = await ctx.db
        .query("teamMembers")
        .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
        .collect();
      // Same rule as routing itself: default to a team with someone else on it.
      for (const membership of memberships) {
        if (await teamHasOtherMembers(ctx, membership.teamId, ctx.userId)) {
          teamId = membership.teamId;
          break;
        }
      }
      teamId ??= memberships[0]?.teamId;
    }
    if (!teamId) return [];
    if (!(await hasTeamAccess(ctx.db, teamId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const rows = await ctx.db
      .query("routedThreads")
      .withIndex("by_team_and_lastMessage", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(80);
    const out = [];
    for (const row of rows) {
      if (args.status !== "all" && !OPEN_STATUSES.has(row.status)) continue;
      out.push(await enrichThread(ctx, row, ctx.userId));
    }
    return out;
  },
});

export const listBySource = authQuery({
  args: {
    sourceKind: routedSourceKindValidator,
    sourceId: v.string(),
  },
  returns: v.array(threadSummary),
  handler: async (ctx, args) => {
    const source = await loadSource(ctx, args.sourceKind, args.sourceId);
    if (!source) return [];
    const repo = await ctx.db.get(source.repoId);
    if (!repo?.teamId) return [];
    if (!(await hasTeamAccess(ctx.db, repo.teamId, ctx.userId))) return [];
    const rows = await ctx.db
      .query("routedThreads")
      .withIndex("by_source", (q) =>
        q.eq("sourceKind", args.sourceKind).eq("sourceId", source.sourceId),
      )
      .collect();
    rows.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    const out = [];
    for (const row of rows) {
      if (!OPEN_STATUSES.has(row.status)) continue;
      out.push(await enrichThread(ctx, row, ctx.userId));
    }
    return out;
  },
});

export const get = authQuery({
  args: { id: v.id("routedThreads") },
  returns: v.union(threadSummary, v.null()),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.id);
    if (!thread) return null;
    if (!(await hasTeamAccess(ctx.db, thread.teamId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    return enrichThread(ctx, thread, ctx.userId);
  },
});

export const listMessages = authQuery({
  args: { threadId: v.id("routedThreads") },
  returns: v.array(messageSummary),
  handler: async (ctx, args) => {
    await assertThreadRead(ctx, args.threadId, ctx.userId);
    const rows = await ctx.db
      .query("routedMessages")
      .withIndex("by_thread_and_created", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(200);
    const out = [];
    for (const row of rows) {
      const author = row.authorUserId
        ? await ctx.db.get(row.authorUserId)
        : null;
      out.push({
        _id: row._id,
        threadId: row.threadId,
        authorKind: row.authorKind,
        authorUserId: row.authorUserId,
        authorName: row.authorKind === "eva" ? "Eva" : displayName(author),
        body: row.body,
        context: row.context,
        createdAt: row.createdAt,
      });
    }
    return out;
  },
});

export const countWaitingForMe = authQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("routedParticipants")
      .withIndex("by_user_and_needsReply", (q) =>
        q.eq("userId", ctx.userId).eq("needsReply", true),
      )
      .collect();
    let count = 0;
    for (const row of rows) {
      const thread = await ctx.db.get(row.threadId);
      if (!thread || !OPEN_STATUSES.has(thread.status)) continue;
      if (await hasTeamAccess(ctx.db, thread.teamId, ctx.userId)) count += 1;
    }
    return count;
  },
});

export const reply = authMutation({
  args: {
    threadId: v.id("routedThreads"),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const body = args.body.trim();
    if (!body) throw new Error("Message cannot be empty");
    const thread = await assertThreadRead(ctx, args.threadId, ctx.userId);
    if (thread.status === "resolved" || thread.status === "cancelled") {
      throw new Error("This thread is closed");
    }
    if (!(await hasTeamAccess(ctx.db, thread.teamId, ctx.userId))) {
      await ctx.db.patch(thread._id, { status: "cancelled" });
      throw new Error("You are no longer on this team");
    }
    if (!(await canWriteThread(ctx, thread, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const now = Date.now();
    await ctx.db.insert("routedMessages", {
      threadId: thread._id,
      authorKind: "user",
      authorUserId: ctx.userId,
      body,
      createdAt: now,
    });
    await ctx.db.patch(thread._id, {
      status: "waiting_eva",
      lastMessageAt: now,
      lastPreview: previewOf(body),
    });
    // Snapshot before patching, so `needsReply` still reads as it did when Eva
    // asked and the outstanding list is the people who have not answered yet.
    const rows = await threadParticipants(ctx, thread._id);
    const outstanding: string[] = [];
    for (const row of rows) {
      if (row.userId === ctx.userId) {
        await ctx.db.patch(row._id, {
          needsReply: false,
          repliedAt: now,
          lastMessageAt: now,
        });
        continue;
      }
      await ctx.db.patch(row._id, { lastMessageAt: now });
      if (row.needsReply) {
        outstanding.push(displayName(await ctx.db.get(row.userId)));
      }
    }
    outstanding.sort((a, b) => a.localeCompare(b));
    const source = await loadSource(ctx, thread.sourceKind, thread.sourceId);
    const author = await ctx.db.get(ctx.userId);
    const name = displayName(author);
    if (source) {
      const closing =
        outstanding.length > 0
          ? `Still waiting on: ${outstanding.join(", ")}. Continue with what you have or wait for the rest; do not re-ask the same question.`
          : "Everyone asked has now replied. Continue the work using this answer. Do not re-ask the same question.";
      await enqueueSourceWake(
        ctx,
        source,
        ctx.userId,
        `Routed reply from ${name} on "${thread.title}":\n\n${body}\n\n${closing}`,
        `${name} replied: ${previewOf(body)}`,
      );
      if (source.ownerUserId !== ctx.userId) {
        await createNotification(ctx, {
          userId: source.ownerUserId,
          type: "routed_question",
          title: `${name} replied about "${thread.title}"`,
          message: previewOf(body),
          href: `/messages?thread=${thread._id}`,
          repoId: thread.repoId,
          ...notifyEntityArgs(source),
        });
      }
    }
    return null;
  },
});

export const resolve = authMutation({
  args: { threadId: v.id("routedThreads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await assertThreadRead(ctx, args.threadId, ctx.userId);
    if (!(await canWriteThread(ctx, thread, ctx.userId))) {
      throw new Error("Not authorized");
    }
    await ctx.db.patch(thread._id, {
      status: "resolved",
      resolvedAt: Date.now(),
    });
    for (const row of await threadParticipants(ctx, thread._id)) {
      if (row.needsReply) await ctx.db.patch(row._id, { needsReply: false });
    }
    return null;
  },
});

const askResult = v.union(
  v.object({
    ok: v.literal(true),
    threadId: v.id("routedThreads"),
    created: v.boolean(),
    participants: v.array(
      v.object({ userId: v.id("users"), name: v.string() }),
    ),
  }),
  v.object({
    ok: v.literal(false),
    error: v.string(),
    candidates: v.optional(
      v.array(
        v.object({
          userId: v.id("users"),
          name: v.string(),
          role: v.union(v.string(), v.null()),
        }),
      ),
    ),
  }),
);

async function askCore(
  ctx: MutationCtx,
  args: {
    actorUserId: Id<"users">;
    sourceKind: SourceKind;
    sourceId: string;
    question: string;
    context: string;
    topicKey: string;
    role?: "business" | "dev" | "designer";
    assigneeUserIds?: Id<"users">[];
  },
): Promise<Infer<typeof askResult>> {
  const question = args.question.trim();
  if (!question) return { ok: false, error: "Question cannot be empty." };
  const agentContext = args.context.trim();
  if (agentContext.length < 20) {
    return {
      ok: false,
      error:
        "Context is too thin. Explain what is being built and why this question matters.",
    };
  }
  const gate = await gateAsk(
    ctx,
    args.actorUserId,
    args.sourceKind,
    args.sourceId,
  );
  if (!gate.ok) return gate;
  const { source, repo } = gate;
  const chosen = await resolveParticipants(ctx, {
    teamId: gate.teamId,
    actorUserId: args.actorUserId,
    userIds: args.assigneeUserIds,
    role: args.role,
  });
  if (!chosen.ok) return chosen;
  const topicKey = normalizeTopicKey(args.topicKey);
  // One open thread per topic per source, whoever is on it — a second ask adds
  // people rather than forking the conversation.
  const existing = await ctx.db
    .query("routedThreads")
    .withIndex("by_source_and_topic", (q) =>
      q.eq("sourceId", source.sourceId).eq("topicKey", topicKey),
    )
    .collect();
  const open = existing.find((row) => OPEN_STATUSES.has(row.status));
  const now = Date.now();
  let threadId: Id<"routedThreads">;
  let created = false;
  if (open) {
    threadId = open._id;
    await ctx.db.patch(open._id, {
      status: "waiting_human",
      lastMessageAt: now,
      lastPreview: previewOf(question),
    });
  } else {
    created = true;
    threadId = await ctx.db.insert("routedThreads", {
      teamId: gate.teamId,
      repoId: repo._id,
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      sourceNumId: source.numId,
      sourceTitle: source.title,
      topicKey,
      title: titleOf(question),
      status: "waiting_human",
      lastMessageAt: now,
      lastPreview: previewOf(question),
      createdAt: now,
    });
  }
  // Eva has just asked, so everyone on the thread is on the hook again — the
  // people already there as well as anyone newly named.
  const alreadyOn = created ? [] : await threadParticipants(ctx, threadId);
  const onThread = new Set(alreadyOn.map((row) => row.userId));
  for (const row of alreadyOn) {
    await ctx.db.patch(row._id, { needsReply: true, lastMessageAt: now });
  }
  for (const person of chosen.users) {
    if (onThread.has(person.userId)) continue;
    await ctx.db.insert("routedParticipants", {
      threadId,
      userId: person.userId,
      teamId: gate.teamId,
      lastMessageAt: now,
      needsReply: true,
      addedAt: now,
    });
  }
  const participants: Array<{ userId: Id<"users">; name: string }> = [];
  for (const row of await threadParticipants(ctx, threadId)) {
    participants.push({
      userId: row.userId,
      name: displayName(await ctx.db.get(row.userId)),
    });
  }
  participants.sort((a, b) => a.name.localeCompare(b.name));
  const owner = await ctx.db.get(source.ownerUserId);
  const context = composeAskContext(
    agentContext,
    source,
    displayName(owner),
    await latestUserRequest(ctx, source.sourceId),
  );
  await ctx.db.insert("routedMessages", {
    threadId,
    authorKind: "eva",
    body: question,
    context,
    createdAt: now,
  });
  const solo =
    participants.length === 1
      ? chosen.users.find((row) => row.userId === participants[0].userId)
      : undefined;
  const roleLabel = solo?.role ? ` (${solo.role})` : "";
  await insertSystemAlert(
    ctx,
    source,
    solo
      ? `Asked ${solo.name}${roleLabel} about ${quotedTitle(question)}. Their reply will land in Messages and continue this chat.`
      : `Asked ${participants.map((row) => row.name).join(", ")} about ${quotedTitle(question)}. Replies land in Messages and continue this chat.`,
  );
  for (const person of participants) {
    await createNotification(ctx, {
      userId: person.userId,
      type: "routed_question",
      title: `Eva asked about "${titleOf(question)}"`,
      message: previewOf(context),
      href: `/messages?thread=${threadId}`,
      repoId: repo._id,
      ...notifyEntityArgs(source),
    });
  }
  return { ok: true, threadId, created, participants };
}

export const ask = authMutation({
  args: {
    sourceKind: routedSourceKindValidator,
    sourceId: v.string(),
    question: v.string(),
    context: v.string(),
    topicKey: v.string(),
    role: v.optional(roleUserValidator),
    assigneeUserIds: v.optional(v.array(v.id("users"))),
  },
  returns: askResult,
  handler: async (ctx, args) => {
    return await askCore(ctx, {
      actorUserId: ctx.userId,
      sourceKind: args.sourceKind,
      sourceId: args.sourceId,
      question: args.question,
      context: args.context,
      topicKey: args.topicKey,
      role: args.role,
      assigneeUserIds: args.assigneeUserIds,
    });
  },
});

export const askFromAgent = internalMutation({
  args: {
    userId: v.string(),
    sourceKind: routedSourceKindValidator,
    sourceId: v.string(),
    question: v.string(),
    context: v.string(),
    topicKey: v.string(),
    role: v.optional(roleUserValidator),
    assigneeUserIds: v.optional(v.array(v.string())),
  },
  returns: askResult,
  handler: async (ctx, args) => {
    const actorUserId = ctx.db.normalizeId("users", args.userId);
    if (!actorUserId) {
      return { ok: false as const, error: "Unknown user." };
    }
    let assigneeUserIds: Id<"users">[] | undefined;
    if (args.assigneeUserIds) {
      assigneeUserIds = [];
      for (const raw of args.assigneeUserIds) {
        const id = ctx.db.normalizeId("users", raw);
        if (!id) return { ok: false as const, error: `Invalid userId: ${raw}` };
        assigneeUserIds.push(id);
      }
    }
    return await askCore(ctx, {
      actorUserId,
      sourceKind: args.sourceKind,
      sourceId: args.sourceId,
      question: args.question,
      context: args.context,
      topicKey: args.topicKey,
      role: args.role,
      assigneeUserIds,
    });
  },
});

/**
 * Who Eva could ask, with their profile text, so a Node action can pick the
 * group with an LLM. Runs the same gate as `ask` to keep refusals identical.
 */
export const candidatesFor = internalQuery({
  args: {
    userId: v.string(),
    sourceKind: routedSourceKindValidator,
    sourceId: v.string(),
    role: v.optional(roleUserValidator),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      candidates: v.array(
        v.object({
          userId: v.id("users"),
          name: v.string(),
          role: v.union(roleUserValidator, v.null()),
          headline: v.string(),
          owns: v.string(),
          askMeAbout: v.string(),
        }),
      ),
    }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const actorUserId = ctx.db.normalizeId("users", args.userId);
    if (!actorUserId) {
      return { ok: false as const, error: "Unknown user." };
    }
    const gate = await gateAsk(
      ctx,
      actorUserId,
      args.sourceKind,
      args.sourceId,
    );
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const directory = await listDirectoryForTeam(ctx, gate.teamId);
    return {
      ok: true as const,
      // The person driving the session must not be offered their own question.
      candidates: directory.filter(
        (row) =>
          row.userId !== actorUserId &&
          (args.role === undefined || row.role === args.role),
      ),
    };
  },
});
