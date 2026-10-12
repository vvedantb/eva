import { v } from "convex/values";
import { z } from "zod";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authMutation, authQuery } from "./functions";
import { chatLogEntryFields, chatLogEntryKindValidator } from "./validators";
import type { ChatLogEntryKind } from "./validators";
import {
  callerCanSeeChatSource,
  chatSourceArgValidator,
  chatSourceFieldsForEntityId,
  listRowsForChatSource,
  type ChatSourceArg,
  type ChatSourceStoredFields,
} from "./_chatSource/helpers";
import { renderChatLogMarkdown } from "@eva/shared/chatLog";

/**
 * A chat's Log: append-only decisions, changes, research, answered questions
 * and notes for one session, quick task or project. Shown pinned at the top of
 * the chat's Documents tab; never copied into `docs`.
 *
 * Writers: the agent (`log_entry` MCP tool) and the user (Add note) through
 * `append`; the system through `recordAnsweredQuestion` (blocking
 * AskUserQuestion) and `recordTurnChange` (a turn that committed).
 */

const TITLE_LIMIT = 200;
const BODY_LIMIT = 4_000;
/** System change entries keep only the start of the turn's reply. */
const CHANGE_BODY_LIMIT = 1_200;
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
  const body = entry.body ? clip(entry.body, BODY_LIMIT) : "";
  return ctx.db.insert("chatLogEntries", {
    ...source,
    kind: entry.kind,
    author: entry.author,
    title: clip(entry.title, TITLE_LIMIT) || "Untitled",
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

/**
 * Logs the commits one turn made, once per reply. Skipped when the turn
 * committed nothing.
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
  if (existing.some((row) => row.kind === "change" && row.author === "system")) {
    return;
  }
  const source = await chatSourceFieldsForEntityId(ctx.db, parentId);
  if (!source) return;
  const firstLine = message.content.trim().split("\n")[0] ?? "";
  await insertEntry(ctx, source, {
    kind: "change",
    author: "system",
    title: firstLine || "Committed changes",
    body: clip(message.content, CHANGE_BODY_LIMIT),
    messageId: message._id,
    beforeSha,
    afterSha,
  });
}
