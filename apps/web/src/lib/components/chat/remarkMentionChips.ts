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
