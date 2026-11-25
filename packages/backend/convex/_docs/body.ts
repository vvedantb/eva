import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { prosemirrorSync } from "../prosemirrorSync";
import { markdownToDocJson } from "../_docEditor/markdown";

/**
 * Overwrites a doc's whole body with markdown: the stored `content` and the
 * live editor document. Resets the sync document rather than transforming it
 * (that needs the editor schema in the isolate), so edits in flight in an
 * open editor are lost. Use it only for an explicit, whole-body rewrite.
 */
export async function replaceDocBody(
  ctx: MutationCtx,
  docId: Id<"docs">,
  markdown: string,
): Promise<void> {
  const snapshot = await ctx.runQuery(
    components.prosemirrorSync.lib.getSnapshot,
    { id: docId },
  );
  if (snapshot.content !== null) {
    await ctx.runMutation(components.prosemirrorSync.lib.deleteDocument, {
      id: docId,
    });
  }
  await prosemirrorSync.create(ctx, docId, markdownToDocJson(markdown));
  const now = Date.now();
  await ctx.db.patch(docId, {
    content: markdown,
    contentUpdatedAt: now,
    updatedAt: now,
  });
}
