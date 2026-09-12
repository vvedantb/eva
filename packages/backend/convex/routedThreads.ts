import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
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
import { listDirectoryForTeam } from "./workProfiles";
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
  assigneeUserId: v.id("users"),
  assigneeName: v.string(),
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

function displayName(user: {
  fullName?: string;
  firstName?: string;
  email?: string;
} | null): string {
  if (!user) return "Teammate";
  return user.fullName || user.firstName || user.email || "Teammate";
}

function scoreOverlap(
  question: string,
  profile: { owns: string; askMeAbout: string; headline: string },
): number {
  const words = new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2),
  );
  const hay = `${profile.owns} ${profile.askMeAbout} ${profile.headline}`
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  let score = 0;
  for (const word of hay) {
    if (word.length > 2 && words.has(word)) score += 1;
  }
  return score;
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
  thread: {
    _id: Id<"routedThreads">;
    teamId: Id<"teams">;
    repoId: Id<"githubRepos">;
    assigneeUserId: Id<"users">;
    sourceKind: SourceKind;
    sourceId: string;
    sourceNumId?: number;
    sourceTitle: string;
    topicKey: string;
    title: string;
    status: ThreadStatus;
    lastMessageAt: number;
    lastPreview: string;
    createdAt: number;
    resolvedAt?: number;
  },
) {
  const assignee = await ctx.db.get(thread.assigneeUserId);
  const repo = await ctx.db.get(thread.repoId);
  const source = await loadSource(ctx, thread.sourceKind, thread.sourceId);
  return {
    _id: thread._id,
    teamId: thread.teamId,
    repoId: thread.repoId,
    assigneeUserId: thread.assigneeUserId,
    assigneeName: displayName(assignee),
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

async function canWriteThread(
  ctx: QueryCtx,
  thread: { assigneeUserId: Id<"users">; sourceKind: SourceKind; sourceId: string },
  userId: Id<"users">,
): Promise<boolean> {
  if (thread.assigneeUserId === userId) return true;
  const source = await loadSource(ctx, thread.sourceKind, thread.sourceId);
  return source?.ownerUserId === userId;
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

async function resolveAssignee(
  ctx: QueryCtx,
  args: {
    teamId: Id<"teams">;
    userId?: Id<"users">;
    role?: "business" | "dev" | "designer";
    question: string;
  },
): Promise<
  | { ok: true; userId: Id<"users">; name: string; role: string | null }
  | {
      ok: false;
      error: string;
      candidates?: Array<{ userId: Id<"users">; name: string; role: string | null }>;
    }
> {
  const directory = await listDirectoryForTeam(ctx, args.teamId);
  if (args.userId) {
    const match = directory.find((row) => row.userId === args.userId);
    if (!match) {
      return { ok: false, error: "That person is not on this team." };
    }
    return {
      ok: true,
      userId: match.userId,
      name: match.name,
      role: match.role,
    };
  }
  if (!args.role) {
    return {
      ok: false,
      error:
        "Pass userId or role (business, dev, designer). Call list_work_profiles first.",
    };
  }
  const byRole = directory.filter((row) => row.role === args.role);
  if (byRole.length === 0) {
    return {
      ok: false,
      error: `No teammate with role "${args.role}" on this team. Ask in the session chat instead.`,
    };
  }
  if (byRole.length === 1) {
    return {
      ok: true,
      userId: byRole[0].userId,
      name: byRole[0].name,
      role: byRole[0].role,
    };
  }
  let best = byRole[0];
  let bestScore = -1;
  let ties = 0;
  for (const row of byRole) {
    const score = scoreOverlap(args.question, row);
    if (score > bestScore) {
      best = row;
      bestScore = score;
      ties = 1;
    } else if (score === bestScore) {
      ties += 1;
    }
  }
  if (bestScore > 0 && ties === 1) {
    return {
      ok: true,
      userId: best.userId,
      name: best.name,
      role: best.role,
    };
  }
  return {
    ok: false,
    error: `Several teammates have role "${args.role}". Pass userId to choose one.`,
    candidates: byRole.map((row) => ({
      userId: row.userId,
      name: row.name,
      role: row.role,
    })),
  };
}

export const listMine = authQuery({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("all"))),
  },
  returns: v.array(threadSummary),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("routedThreads")
      .withIndex("by_assignee_and_lastMessage", (q) =>
        q.eq("assigneeUserId", ctx.userId),
      )
      .order("desc")
      .take(80);
    const out = [];
    for (const row of rows) {
      if (!(await hasTeamAccess(ctx.db, row.teamId, ctx.userId))) continue;
      if (args.status !== "all" && !OPEN_STATUSES.has(row.status)) continue;
      out.push(await enrichThread(ctx, row));
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
      for (const membership of memberships) {
        const team = await ctx.db.get(membership.teamId);
        if (team && team.isPersonal !== true) {
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
      out.push(await enrichThread(ctx, row));
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
      out.push(await enrichThread(ctx, row));
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
    return enrichThread(ctx, thread);
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
      .query("routedThreads")
      .withIndex("by_assignee_and_status", (q) =>
        q.eq("assigneeUserId", ctx.userId).eq("status", "waiting_human"),
      )
      .collect();
    let count = 0;
    for (const row of rows) {
      if (await hasTeamAccess(ctx.db, row.teamId, ctx.userId)) count += 1;
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
    const source = await loadSource(ctx, thread.sourceKind, thread.sourceId);
    const author = await ctx.db.get(ctx.userId);
    const name = displayName(author);
    if (source) {
      await enqueueSourceWake(
        ctx,
        source,
        ctx.userId,
        `Routed reply from ${name} on "${thread.title}":\n\n${body}\n\nContinue the work using this answer. Do not re-ask the same question.`,
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
    return null;
  },
});

const askResult = v.union(
  v.object({
    ok: v.literal(true),
    threadId: v.id("routedThreads"),
    created: v.boolean(),
    assigneeUserId: v.id("users"),
    assigneeName: v.string(),
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
    topicKey: string;
    role?: "business" | "dev" | "designer";
    assigneeUserId?: Id<"users">;
  },
): Promise<Infer<typeof askResult>> {
  const question = args.question.trim();
  if (!question) return { ok: false, error: "Question cannot be empty." };
  const source = await loadSource(ctx, args.sourceKind, args.sourceId);
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
  if (!team || team.isPersonal === true) {
    return {
      ok: false,
      error: "Personal teams skip routing. Ask in the session chat.",
    };
  }
  if (!(await hasTeamAccess(ctx.db, repo.teamId, args.actorUserId))) {
    return { ok: false, error: "Not authorized for this team's repo." };
  }
  const assignee = await resolveAssignee(ctx, {
    teamId: repo.teamId,
    userId: args.assigneeUserId,
    role: args.role,
    question,
  });
  if (!assignee.ok) return assignee;
  const topicKey = normalizeTopicKey(args.topicKey);
  const existing = await ctx.db
    .query("routedThreads")
    .withIndex("by_source_assignee_topic", (q) =>
      q
        .eq("sourceId", source.sourceId)
        .eq("assigneeUserId", assignee.userId)
        .eq("topicKey", topicKey),
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
      teamId: repo.teamId,
      repoId: repo._id,
      assigneeUserId: assignee.userId,
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
  await ctx.db.insert("routedMessages", {
    threadId,
    authorKind: "eva",
    body: question,
    createdAt: now,
  });
  const roleLabel = assignee.role ? ` (${assignee.role})` : "";
  await insertSystemAlert(
    ctx,
    source,
    `Asked ${assignee.name}${roleLabel} about ${titleOf(question)}. Their reply will land in Messages and continue this chat.`,
  );
  await createNotification(ctx, {
    userId: assignee.userId,
    type: "routed_question",
    title: `Eva asked about "${titleOf(question)}"`,
    message: previewOf(question),
    href: `/messages?thread=${threadId}`,
    repoId: repo._id,
    ...notifyEntityArgs(source),
  });
  return {
    ok: true,
    threadId,
    created,
    assigneeUserId: assignee.userId,
    assigneeName: assignee.name,
  };
}

export const ask = authMutation({
  args: {
    sourceKind: routedSourceKindValidator,
    sourceId: v.string(),
    question: v.string(),
    topicKey: v.string(),
    role: v.optional(roleUserValidator),
    assigneeUserId: v.optional(v.id("users")),
  },
  returns: askResult,
  handler: async (ctx, args) => {
    return await askCore(ctx, {
      actorUserId: ctx.userId,
      sourceKind: args.sourceKind,
      sourceId: args.sourceId,
      question: args.question,
      topicKey: args.topicKey,
      role: args.role,
      assigneeUserId: args.assigneeUserId,
    });
  },
});

export const askFromAgent = internalMutation({
  args: {
    userId: v.string(),
    sourceKind: routedSourceKindValidator,
    sourceId: v.string(),
    question: v.string(),
    topicKey: v.string(),
    role: v.optional(roleUserValidator),
    assigneeUserId: v.optional(v.string()),
  },
  returns: askResult,
  handler: async (ctx, args) => {
    const actorUserId = ctx.db.normalizeId("users", args.userId);
    if (!actorUserId) {
      return { ok: false as const, error: "Unknown user." };
    }
    const assigneeUserId = args.assigneeUserId
      ? ctx.db.normalizeId("users", args.assigneeUserId)
      : undefined;
    if (args.assigneeUserId && !assigneeUserId) {
      return { ok: false as const, error: "Invalid userId." };
    }
    return await askCore(ctx, {
      actorUserId,
      sourceKind: args.sourceKind,
      sourceId: args.sourceId,
      question: args.question,
      topicKey: args.topicKey,
      role: args.role,
      assigneeUserId: assigneeUserId ?? undefined,
    });
  },
});
