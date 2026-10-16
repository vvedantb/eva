import { v } from "convex/values";
import { z } from "zod";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { chatLogEntryFields, chatLogEntryKindValidator } from "./validators";
import type { ChatLogEntryKind } from "./validators";
import {
  callerCanSeeChatSource,
  chatSourceArgFromFields,
  chatSourceArgValidator,
  chatSourceFieldsForEntityId,
  chatSourceSummaryValidator,
  listRowsForChatSource,
  resolveChatSource,
  type ChatSourceArg,
  type ChatSourceStoredFields,
  type RepoCache,
} from "./_chatSource/helpers";
import {
  CHAT_LOG_AGENT_BODY_MAX,
  CHAT_LOG_AGENT_TITLE_MAX,
  renderChatLogMarkdown,
} from "@eva/shared/chatLog";

/**
 * A chat's Log: append-only decisions, changes, research, answered questions
 * and notes for one session, quick task or project. Shown pinned at the top of
 * the chat's Documents tab; never copied into `docs`.
 *
 * Writers: the agent (`log_entry` MCP tool) and the user (Add note) through
 * `append`; the system through `recordAnsweredQuestion` (blocking
 * AskUserQuestion) and `recordTurnChange` (a turn that committed).
 */

/** User notes may run longer; agent and system entries stay skimmable. */
const LIMITS: Record<
  Doc<"chatLogEntries">["author"],
  { title: number; body: number }
> = {
  user: { title: 200, body: 4_000 },
  agent: { title: CHAT_LOG_AGENT_TITLE_MAX, body: CHAT_LOG_AGENT_BODY_MAX },
  system: { title: CHAT_LOG_AGENT_TITLE_MAX, body: 4_000 },
};
/** Cap on the catch-up block a fresh agent session gets. */
export const CHAT_LOG_DIGEST_BUDGET = 8_000;

const chatLogRowValidator = v.object({
  _id: v.id("chatLogEntries"),
  _creationTime: v.number(),
  ...chatLogEntryFields,
  supersededById: v.optional(v.id("chatLogEntries")),
});
type ChatLogRow = Doc<"chatLogEntries"> & {
  supersededById?: Id<"chatLogEntries">;
};

function clip(text: string, limit: number): string {
  const trimmed = text.trim();
  return trimmed.length <= limit
    ? trimmed
    : `${trimmed.slice(0, limit - 1)}…`;
}

/** Oldest first, each row stamped with the newer entry that replaced it. */
async function loadRows(
  ctx: QueryCtx,
  source: ChatSourceArg,
): Promise<ChatLogRow[]> {
  const rows = await listRowsForChatSource(ctx, "chatLogEntries", source);
  // _creationTime, not createdAt: two entries in one millisecond keep order.
  rows.sort((a, b) => a._creationTime - b._creationTime);
  const replacedBy = new Map<string, Id<"chatLogEntries">>();
  for (const row of rows) {
    if (row.supersedesId) replacedBy.set(row.supersedesId, row._id);
  }
  return rows.map((row) => {
    const supersededById = replacedBy.get(row._id);
    return supersededById ? { ...row, supersededById } : row;
  });
}

/** The chat's repo; a quick task without one falls back to its project's. */
async function repoIdForSource(
  ctx: QueryCtx,
  source: ChatSourceStoredFields,
): Promise<Id<"githubRepos"> | undefined> {
  if (source.sourceSessionId) {
    return (await ctx.db.get(source.sourceSessionId))?.repoId;
  }
  if (source.sourceProjectId) {
    return (await ctx.db.get(source.sourceProjectId))?.repoId;
  }
  if (!source.sourceTaskId) return undefined;
  const task = await ctx.db.get(source.sourceTaskId);
  if (!task) return undefined;
  if (task.repoId) return task.repoId;
  return task.projectId
    ? (await ctx.db.get(task.projectId))?.repoId
    : undefined;
}

async function insertEntry(
  ctx: MutationCtx,
  source: ChatSourceStoredFields,
  entry: {
    kind: ChatLogEntryKind;
    author: Doc<"chatLogEntries">["author"];
    title: string;
    body?: string;
    supersedesId?: Id<"chatLogEntries">;
    messageId?: Id<"messages">;
    beforeSha?: string;
    afterSha?: string;
  },
): Promise<Id<"chatLogEntries">> {
  const limits = LIMITS[entry.author];
  const body = entry.body ? clip(entry.body, limits.body) : "";
  const repoId = await repoIdForSource(ctx, source);
  return ctx.db.insert("chatLogEntries", {
    ...source,
    ...(repoId ? { repoId } : {}),
    kind: entry.kind,
    author: entry.author,
    title: clip(entry.title, limits.title) || "Untitled",
    ...(body ? { body } : {}),
    ...(entry.supersedesId ? { supersedesId: entry.supersedesId } : {}),
    ...(entry.messageId ? { messageId: entry.messageId } : {}),
    ...(entry.beforeSha ? { beforeSha: entry.beforeSha } : {}),
    ...(entry.afterSha ? { afterSha: entry.afterSha } : {}),
    createdAt: Date.now(),
  });
}

function sameChat(
  row: Doc<"chatLogEntries">,
  source: ChatSourceStoredFields,
): boolean {
  return (
    row.sourceKind === source.sourceKind &&
    row.sourceSessionId === source.sourceSessionId &&
    row.sourceTaskId === source.sourceTaskId &&
    row.sourceProjectId === source.sourceProjectId
  );
}

function storedFields(source: ChatSourceArg): ChatSourceStoredFields {
  if (source.kind === "session") {
    return { sourceKind: "session", sourceSessionId: source.sessionId };
  }
  if (source.kind === "task") {
    return { sourceKind: "task", sourceTaskId: source.taskId };
  }
  return { sourceKind: "project", sourceProjectId: source.projectId };
}

/** Deletes every entry for one chat (repo deletion). Returns the count. */
export async function deleteChatLogEntries(
  ctx: MutationCtx,
  source: ChatSourceArg,
): Promise<number> {
  const rows = await listRowsForChatSource(ctx, "chatLogEntries", source);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}

/** Newest entries scanned for the repo list; older-only chats drop off. */
const REPO_LOG_SCAN_LIMIT = 1_000;

const repoChatLogValidator = v.object({
  source: chatSourceSummaryValidator,
  entryCount: v.number(),
  decisionCount: v.number(),
  latestTitle: v.string(),
  updatedAt: v.number(),
});

/**
 * One row per chat with a Log in this repo, newest activity first. Feeds the
 * repo Documents list; built from the entries, never stored as a doc.
 */
export const listForRepo = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(repoChatLogValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const recent = await ctx.db
      .query("chatLogEntries")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .order("desc")
      .take(REPO_LOG_SCAN_LIMIT);
    const chats = new Map<string, Doc<"chatLogEntries">[]>();
    for (const row of recent) {
      const key = String(
        row.sourceSessionId ?? row.sourceTaskId ?? row.sourceProjectId,
      );
      const group = chats.get(key);
      if (group) group.push(row);
      else chats.set(key, [row]);
    }
    const cache: RepoCache = new Map();
    const result = [];
    // Map order follows the scan: the chat with the newest entry comes first.
    for (const group of chats.values()) {
      const newest = group[0];
      if (!newest) continue;
      const arg = chatSourceArgFromFields(newest);
      if (!arg || !(await callerCanSeeChatSource(ctx, arg))) continue;
      const source = await resolveChatSource(ctx, newest, cache);
      if (!source) continue;
      const replaced = new Set(group.map((row) => row.supersedesId));
      result.push({
        source,
        entryCount: group.length,
        decisionCount: group.filter(
          (row) => row.kind === "decision" && !replaced.has(row._id),
        ).length,
        latestTitle: newest.title,
        updatedAt: newest.createdAt,
      });
    }
    return result;
  },
});

/** Every entry for one chat, oldest first. */
export const listForSource = authQuery({
  args: { source: chatSourceArgValidator },
  returns: v.array(chatLogRowValidator),
  handler: async (ctx, args) => {
    if (!(await callerCanSeeChatSource(ctx, args.source))) return [];
    return loadRows(ctx, args.source);
  },
});

/**
 * Adds one entry. The agent calls this through `log_entry`; the Documents tab
 * through Add note. `supersedesId` must name an entry in the same chat.
 */
export const append = authMutation({
  args: {
    source: chatSourceArgValidator,
    kind: chatLogEntryKindValidator,
    author: v.union(v.literal("agent"), v.literal("user")),
    title: v.string(),
    body: v.optional(v.string()),
    supersedesId: v.optional(v.id("chatLogEntries")),
  },
  returns: v.id("chatLogEntries"),
  handler: async (ctx, args) => {
    if (!(await callerCanSeeChatSource(ctx, args.source))) {
      throw new Error("Not authorized to write to this chat's log.");
    }
    if (!args.title.trim()) throw new Error("A log entry needs a title.");
    const source = storedFields(args.source);
    if (args.supersedesId !== undefined) {
      const replaced = await ctx.db.get(args.supersedesId);
      if (!replaced || !sameChat(replaced, source)) {
        throw new Error("supersedesId must name an entry in this chat's log.");
      }
    }
    return insertEntry(ctx, source, {
      kind: args.kind,
      author: args.author,
      title: args.title,
      body: args.body,
      supersedesId: args.supersedesId,
    });
  },
});

/** The Log as markdown, for the agent's `read_chat_log` tool. */
export const markdownForSource = authQuery({
  args: { source: chatSourceArgValidator },
  returns: v.string(),
  handler: async (ctx, args) => {
    if (!(await callerCanSeeChatSource(ctx, args.source))) {
      throw new Error("Not authorized to read this chat's log.");
    }
    return renderChatLogMarkdown(await loadRows(ctx, args.source));
  },
});

/**
 * Catch-up block for an agent whose own session has not seen this chat (a
 * provider handoff). Empty when the chat has no Log yet.
 */
export async function chatLogDigestBlock(
  ctx: QueryCtx,
  source: ChatSourceArg,
): Promise<string> {
  const rows = await loadRows(ctx, source);
  if (rows.length === 0) return "";
  const markdown = renderChatLogMarkdown(rows, {
    budget: CHAT_LOG_DIGEST_BUDGET,
  }).replaceAll("<", "\\u003c");
  return `<chat_log>\nThis chat's Log (Documents tab): what was decided, changed and found so far. Current decisions still apply unless the user changes them. Call read_chat_log for the full Log.\n${markdown}\n</chat_log>`;
}

const questionPayloadSchema = z.object({
  questions: z.array(z.object({ question: z.string() }).passthrough()),
});
const answersSchema = z.record(z.string(), z.string());

function parseJsonWith<T>(schema: z.ZodType<T>, text: string): T | null {
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Logs a blocking AskUserQuestion with the user's answer before the sandbox
 * claims (and deletes) the question row.
 */
export async function recordAnsweredQuestion(
  ctx: MutationCtx,
  entityId: string,
  payload: string,
  answerJson: string,
): Promise<void> {
  const source = await chatSourceFieldsForEntityId(ctx.db, entityId);
  if (!source) return;
  const parsed = parseJsonWith(questionPayloadSchema, payload);
  const questions = parsed?.questions.map((item) => item.question) ?? [];
  if (questions.length === 0) return;
  const answers = parseJsonWith(answersSchema, answerJson) ?? {};
  const body = questions
    .map((question) => `Q: ${question}\nA: ${answers[question] ?? "(no answer)"}`)
    .join("\n\n");
  await insertEntry(ctx, source, {
    kind: "question",
    author: "user",
    title: questions[0] ?? "Question",
    body,
  });
}

/** First sentence of the reply, without list or emphasis markup. */
function turnHeadline(content: string): string {
  const line =
    content
      .split("\n")
      .map((text) => text.trim())
      .find(Boolean) ?? "";
  const plain = line
    .replace(/^(?:[-*]|\d+\.)\s+/, "")
    .replaceAll("**", "")
    .replaceAll("`", "");
  return plain.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? plain;
}

/**
 * Logs the commits one turn made, once per reply. The commit range goes onto
 * the agent's own change entry from this turn when there is one; otherwise
 * Eva adds a one-line entry. Skipped when the turn committed nothing, or when
 * HEAD only moved back to an already-logged commit (a branch switch).
 */
export async function recordTurnChange(
  ctx: MutationCtx,
  parentId: string,
  message: Doc<"messages">,
  beforeSha: string | undefined,
  afterSha: string | undefined,
): Promise<void> {
  if (!beforeSha || !afterSha || beforeSha === afterSha) return;
  const existing = await ctx.db
    .query("chatLogEntries")
    .withIndex("by_message", (q) => q.eq("messageId", message._id))
    .collect();
  if (existing.some((row) => row.kind === "change")) return;
  const source = await chatSourceFieldsForEntityId(ctx.db, parentId);
  const sourceArg = source ? chatSourceArgFromFields(source) : null;
  if (!source || !sourceArg) return;
  const rows = await listRowsForChatSource(ctx, "chatLogEntries", sourceArg);
  if (rows.some((row) => row.afterSha === afterSha)) return;
  // Newest first; the reply row exists from the turn's start, so later agent
  // entries belong to this turn.
  const agentChange = rows.find(
    (row) =>
      row.kind === "change" &&
      row.author === "agent" &&
      row.afterSha === undefined &&
      row._creationTime >= message._creationTime,
  );
  if (agentChange) {
    await ctx.db.patch(agentChange._id, {
      messageId: message._id,
      beforeSha,
      afterSha,
    });
    return;
  }
  await insertEntry(ctx, source, {
    kind: "change",
    author: "system",
    title: turnHeadline(message.content) || "Committed changes",
    messageId: message._id,
    beforeSha,
    afterSha,
  });
}
