/**
 * Remark plugin that recognises inline mention/skill tokens inside Markdown and
 * marks them so they can be rendered as chips instead of plain links (the
 * phone, which has no remark, does it on the text: `mentionTokensToChipLinks`).
 *
 * Tokens are authored as `@[Label](convexId)` (doc) and `/[Label](convexId)`
 * (skill). Markdown's own parser already turns the `[Label](convexId)` part into
 * a link node (url = the convex id) preceded by a text node ending in `@` or
 * `/`. This plugin finds those links, strips the trailing `@`/`/` from the
 * preceding text, and rewrites the url to a `#mention:<kind>:<id>` fragment so a
 * custom link renderer can swap in the chip. Using a hash fragment keeps the url
 * safe (no external scheme to be stripped by link sanitisation).
 */

import { CONVEX_ID_PATTERN, mentionChipHref, type MentionChipKind } from "@eva/shared";

interface MdNode {
  type: string;
  url?: string;
  value?: string;
  children?: MdNode[];
}

function rewriteChildren(node: MdNode): void {
  const children = node.children;
  if (!children) return;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (
      child.type === "link" &&
      typeof child.url === "string" &&
      CONVEX_ID_PATTERN.test(child.url)
    ) {
      const prev = i > 0 ? children[i - 1] : undefined;
      let kind: MentionChipKind | null = null;
      if (prev && prev.type === "text" && typeof prev.value === "string") {
        if (prev.value.endsWith("@")) kind = "at";
        else if (prev.value.endsWith("/")) kind = "slash";
      }
      if (kind && prev && typeof prev.value === "string") {
        prev.value = prev.value.slice(0, -1);
        child.url = mentionChipHref(kind, child.url);
      }
      continue;
    }

    rewriteChildren(child);
  }
}

export function remarkMentionChips() {
  return (tree: MdNode): void => rewriteChildren(tree);
}
