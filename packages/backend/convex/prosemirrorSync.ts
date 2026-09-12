import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";
import { getCurrentUserId } from "./_auth/currentUser";
import { assertDocAccess } from "./_auth/entityAccess";

const prosemirrorSync = new ProsemirrorSync(components.prosemirrorSync);

export { prosemirrorSync };

interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

function pmJsonToMarkdown(node: PMNode, depth?: number): string {
  const d = depth ?? 0;
  if (node.type === "text") {
    let text = node.text ?? "";
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "bold" || mark.type === "strong")
          text = `**${text}**`;
        else if (mark.type === "italic" || mark.type === "em")
          text = `*${text}*`;
        else if (mark.type === "code") text = `\`${text}\``;
        else if (mark.type === "link")
          text = `[${text}](${String(mark.attrs?.href ?? "")})`;
        // Suggestion marks: deletion text excluded, insertion/modification included
        else if (mark.type === "deletion") return "";
      }
    }
    return text;
  }

  const children = (node.content ?? [])
    .map((c) => pmJsonToMarkdown(c, d))
    .join("");

  switch (node.type) {
    case "doc":
      return children;
    case "paragraph":
      return children + "\n\n";
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      return "#".repeat(level) + " " + children + "\n\n";
    }
    case "bulletList":
      return (node.content ?? [])
        .map((li) => "- " + pmJsonToMarkdown(li, d + 1).trimStart())
        .join("");
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ` + pmJsonToMarkdown(li, d + 1).trimStart())
        .join("");
    case "listItem":
      return children;
    case "codeBlock": {
      const lang = String(node.attrs?.language ?? "");
      return "```" + lang + "\n" + children + "```\n\n";
    }
    case "blockquote":
      return (
        children
          .split("\n")
          .map((line) => "> " + line)
          .join("\n") + "\n"
      );
    case "horizontalRule":
      return "---\n\n";
    case "hardBreak":
      return "\n";
    default:
      return children;
  }
}

async function assertDocRepoAccess(
  ctx: QueryCtx | MutationCtx,
  id: string,
): Promise<void> {
  const userId = await getCurrentUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const docId = ctx.db.normalizeId("docs", id);
  if (!docId) throw new Error("Invalid document ID");
  await assertDocAccess(ctx.db, docId, userId);
}

export const {
  getSnapshot,
  submitSnapshot,
  latestVersion,
  getSteps,
  submitSteps,
} = prosemirrorSync.syncApi<DataModel>({
  checkRead: assertDocRepoAccess,
  checkWrite: assertDocRepoAccess,
  onSnapshot: async (ctx, id, snapshot) => {
    const docId = ctx.db.normalizeId("docs", id);
    if (!docId) return;
    const doc = await ctx.db.get(docId);
    if (!doc) return;

    let markdown: string;
    try {
      const parsed: PMNode = JSON.parse(snapshot);
      markdown = pmJsonToMarkdown(parsed).trim();
    } catch {
      return;
    }

    if (markdown === doc.content) return;
    const now = Date.now();
    await ctx.db.patch(docId, {
      content: markdown,
      contentUpdatedAt: now,
      updatedAt: now,
    });
  },
});
