import StarterKit from "@tiptap/starter-kit";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import type { JSONContent } from "@tiptap/core";

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/**
 * Parses markdown into ProseMirror JSON using the same StarterKit + GFM
 * configuration as the document editor. Used when a doc's content is first
 * handed to the prosemirror-sync component (lazy migration of legacy docs,
 * newly created docs, and session-plan imports) so the structure — headings,
 * lists, code blocks — is preserved instead of being dumped as one literal
 * markdown paragraph.
 *
 * Only the *parse* direction lives here: markdown never contains the comment
 * or suggestion marks, so StarterKit + Markdown alone produce JSON valid in
 * the (superset) editor schema. The reverse direction (PM JSON -> markdown
 * mirror) stays in prosemirrorSync.ts, which tolerates unknown marks.
 *
 * MarkdownManager is headless (no DOM), so it runs in the Convex isolate.
 */
export function markdownToDocJson(markdown: string): JSONContent {
  if (!markdown.trim()) return EMPTY_DOC;
  const manager = new MarkdownManager({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      Markdown.configure({ markedOptions: { gfm: true } }),
    ],
    markedOptions: { gfm: true },
  });
  const json = manager.parse(markdown);
  if (!json.content || json.content.length === 0) return EMPTY_DOC;
  return json;
}
