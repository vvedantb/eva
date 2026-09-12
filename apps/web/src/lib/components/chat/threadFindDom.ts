import {
  collectCaseInsensitiveSubstringRanges,
  normalizeFindQuery,
} from "@/lib/components/chat/threadFind";

export const THREAD_FIND_MARK_ATTR = "data-thread-find-match";

const MARK_CLASS =
  "thread-find-match rounded-sm bg-primary/30 text-inherit box-decoration-clone";
const MARK_ACTIVE_CLASS =
  "thread-find-match-active bg-primary/60 ring-1 ring-primary";

export function clearThreadFindMarks(root: ParentNode): void {
  const marks = root.querySelectorAll(`mark[${THREAD_FIND_MARK_ATTR}]`);
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  }
}

function collectMessageTextNodes(message: Element): Text[] {
  const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[data-thread-find-bar]")) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.closest("script, style, noscript")) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) nodes.push(current);
    current = walker.nextNode();
  }
  return nodes;
}

function wrapQueryInTextNode(node: Text, needle: string): HTMLElement[] {
  const ranges = collectCaseInsensitiveSubstringRanges(node.data, needle);
  const marks: HTMLElement[] = [];
  for (let index = ranges.length - 1; index >= 0; index--) {
    const range = ranges[index];
    if (!range) continue;
    node.splitText(range.endOffset);
    const match = node.splitText(range.startOffset);
    const mark = document.createElement("mark");
    mark.setAttribute(THREAD_FIND_MARK_ATTR, "true");
    mark.className = MARK_CLASS;
    match.parentNode?.insertBefore(mark, match);
    mark.appendChild(match);
    marks.unshift(mark);
  }
  return marks;
}

export function applyThreadFindMarks(
  root: ParentNode,
  query: string,
  activeIndex: number,
): HTMLElement | null {
  clearThreadFindMarks(root);
  const needle = normalizeFindQuery(query);
  if (needle.length === 0) return null;

  const marks: HTMLElement[] = [];
  const messages = root.querySelectorAll("[data-message-id]");
  for (const message of messages) {
    for (const node of collectMessageTextNodes(message)) {
      marks.push(...wrapQueryInTextNode(node, needle));
    }
  }

  if (marks.length === 0) return null;
  const safe = Math.min(Math.max(activeIndex, 0), marks.length - 1);
  const active = marks[safe];
  if (!active) return null;
  active.setAttribute(THREAD_FIND_MARK_ATTR, "active");
  active.className = `${MARK_CLASS} ${MARK_ACTIVE_CLASS}`;
  return active;
}
