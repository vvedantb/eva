import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { MENTION_TOKEN_REGEX } from "./mentionToken";
import { DATA_MENTION_TABLE, type DataMentionKind } from "./dataKinds";

interface ResolvedDocMention {
  kind: "document";
  title: string;
  content: string;
}

interface ResolvedMcpMention {
  kind: Exclude<DataMentionKind, "document">;
  title: string;
  id: string;
}

export interface ResolvedMentionsResult {
  resolvedMessage: string;
  prefixBlock: string;
}

/**
 * Walks `@[Title](id)` tokens in `message`, looks up each id against docs /
 * sessions / projects / agentTasks (scoped to `repoId`), and returns:
 *   - `resolvedMessage`: tokens replaced inline with plain `@Title`
 *   - `prefixBlock`: doc bodies inlined + MCP fetch hints for other entities
 *
 * Unresolved tokens (wrong repo / missing / user ids) still become `@Title`
 * so prose stays readable, but they are omitted from the prefix block.
 */
export async function resolveDocMentions(
  ctx: QueryCtx,
  message: string,
  repoId: Id<"githubRepos">,
): Promise<ResolvedMentionsResult> {
  const matches = [...message.matchAll(MENTION_TOKEN_REGEX)];
  if (matches.length === 0) {
    return { resolvedMessage: message, prefixBlock: "" };
  }

  const uniqueIds = new Set<string>();
  for (const match of matches) {
    uniqueIds.add(match[2]);
  }

  const docs = new Map<string, ResolvedDocMention>();
  const mcpRefs = new Map<string, ResolvedMcpMention>();

  // Ids resolve independently: look them up together, then fill the maps in
  // message order so the prefix block order does not change.
  const ids = [...uniqueIds];
  const resolved = await Promise.all(
    ids.map((rawId) => resolveMention(ctx, rawId, repoId)),
  );
  ids.forEach((rawId, i) => {
    const mention = resolved[i];
    if (mention === null) return;
    if (mention.kind === "document") docs.set(rawId, mention);
    else mcpRefs.set(rawId, mention);
  });

  const resolvedMessage = stripMentionTokens(message);

  const sections: string[] = [];

  if (docs.size > 0) {
    const docSections = [...docs.values()].map(
      (doc) => `### ${doc.title}\n${doc.content}`,
    );
    sections.push(
      `## Referenced documents\n\n${docSections.join("\n\n---\n\n")}`,
    );
  }

  if (mcpRefs.size > 0) {
    const lines = [...mcpRefs.values()].map((ref) => {
      const table = DATA_MENTION_TABLE[ref.kind];
      const kindLabel =
        ref.kind === "quickTask"
          ? "Quick task"
          : ref.kind === "session"
            ? "Session"
            : "Project";
      return `- ${kindLabel} "${ref.title}" — id \`${ref.id}\` (table \`${table}\`)`;
    });
    sections.push(
      [
        "## Referenced Eva data",
        "",
        "The user referenced these entities. Use Eva MCP tools (`query_table`, `get_document`, `get_eva_doc`, `list_eva_docs`, or message/history queries as appropriate) to load their content before answering — do not invent details.",
        "",
        ...lines,
      ].join("\n"),
    );
  }

  if (sections.length === 0) {
    return { resolvedMessage, prefixBlock: "" };
  }

  const prefixBlock = `${sections.join("\n\n---\n\n")}\n\n---`;
  return { resolvedMessage, prefixBlock };
}

/** One mention id, tried against docs, sessions, projects, then tasks. */
async function resolveMention(
  ctx: QueryCtx,
  rawId: string,
  repoId: Id<"githubRepos">,
): Promise<ResolvedDocMention | ResolvedMcpMention | null> {
  const docId = ctx.db.normalizeId("docs", rawId);
  if (docId) {
    const doc = await ctx.db.get(docId);
    if (doc && doc.repoId === repoId) {
      return { kind: "document", title: doc.title, content: doc.content };
    }
  }

  const sessionId = ctx.db.normalizeId("sessions", rawId);
  if (sessionId) {
    const session = await ctx.db.get(sessionId);
    if (session && session.repoId === repoId) {
      return { kind: "session", title: session.title, id: session._id };
    }
  }

  const projectId = ctx.db.normalizeId("projects", rawId);
  if (projectId) {
    const project = await ctx.db.get(projectId);
    if (project && project.repoId === repoId) {
      return { kind: "project", title: project.title, id: project._id };
    }
  }

  const taskId = ctx.db.normalizeId("agentTasks", rawId);
  if (taskId) {
    const task = await ctx.db.get(taskId);
    if (task && task.repoId === repoId) {
      return { kind: "quickTask", title: task.title, id: task._id };
    }
  }
  return null;
}

/**
 * Replaces every `@[Title](id)` token with plain `@Title`. Used when
 * embedding historical messages into a follow-up prompt — we want the
 * conversation to read naturally without re-injecting old doc content.
 */
export function stripMentionTokens(message: string): string {
  return message.replace(MENTION_TOKEN_REGEX, (_full, title) => `@${title}`);
}
