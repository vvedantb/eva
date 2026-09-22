import {
  collectCaseInsensitiveSubstringRanges,
  normalizeFindQuery,
} from "@/lib/components/chat/threadFind";

const HIGHLIGHT_NAME = "eva-thread-find";
const ACTIVE_HIGHLIGHT_NAME = "eva-thread-find-active";

/**
 * `::highlight()` only matches highlights registered by name, so these rules
 * cannot be expressed as a Tailwind class. Rendered by ThreadFindBar through
 * React 19's hoisted `<style href precedence>` because globals.css is owned
 * elsewhere.
 */
export const THREAD_FIND_HIGHLIGHT_CSS = `::highlight(${HIGHLIGHT_NAME}){background-color:rgb(var(--primary)/0.3);}
::highlight(${ACTIVE_HIGHLIGHT_NAME}){background-color:rgb(var(--primary)/0.65);color:rgb(var(--primary-foreground));}`;

/**
 * Null on browsers without the CSS Custom Highlight API (Firefox < 140 at time
 * of writing). Counting and scroll-to still work there; only the paint is lost.
 */
function highlightRegistry(): HighlightRegistry | null {
  if (typeof CSS === "undefined") return null;
  if (!("highlights" in CSS)) return null;
  return CSS.highlights;
}

export function clearThreadFindHighlights(): void {
  const registry = highlightRegistry();
  if (!registry) return;
  registry.delete(HIGHLIGHT_NAME);
  registry.delete(ACTIVE_HIGHLIGHT_NAME);
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

function collectThreadFindRanges(root: ParentNode, needle: string): Range[] {
  const ranges: Range[] = [];
  for (const message of root.querySelectorAll("[data-message-id]")) {
    for (const node of collectMessageTextNodes(message)) {
      for (const hit of collectCaseInsensitiveSubstringRanges(
        node.data,
        needle,
      )) {
        const range = document.createRange();
        range.setStart(node, hit.startOffset);
        range.setEnd(node, hit.endOffset);
        ranges.push(range);
      }
    }
  }
  return ranges;
}

/**
 * Paints the matches inside `root`.
 *
 * Ranges are handed to the Custom Highlight API rather than wrapped in `<mark>`
 * elements: the transcript is React-rendered markdown, and splitting its text
 * nodes leaves React's fiber `stateNode` pointers aimed at nodes that are now
 * empty, wrapped or (after `normalize()`) detached — which duplicated text on
 * streaming messages and threw NotFoundError on unmount. A highlight paints
 * over the same DOM without changing it, and the Ranges are live, so they track
 * the edits React makes while a message streams.
 */
export function paintThreadFindHighlights(
  root: ParentNode,
  query: string,
  activeIndex: number,
): void {
  clearThreadFindHighlights();
  const registry = highlightRegistry();
  if (!registry) return;
  const needle = normalizeFindQuery(query);
  if (needle.length === 0) return;

  const ranges = collectThreadFindRanges(root, needle);
  if (ranges.length === 0) return;
  const safe = Math.min(Math.max(activeIndex, 0), ranges.length - 1);
  // Two registrations, not one: the active match needs its own rule, and a
  // range in both highlights would paint with the later registration's colour.
  const rest = ranges.filter((_, index) => index !== safe);
  const active = ranges[safe];
  if (rest.length > 0) registry.set(HIGHLIGHT_NAME, new Highlight(...rest));
  if (active) registry.set(ACTIVE_HIGHLIGHT_NAME, new Highlight(active));
}

/**
 * The element holding the active match, for scroll-to. Kept separate from
 * painting so that jumping to a match and repainting a growing transcript can
 * be triggered independently — repainting must not yank the scroll position.
 */
export function findThreadFindMatchElement(
  root: ParentNode,
  query: string,
  activeIndex: number,
): Element | null {
  const needle = normalizeFindQuery(query);
  if (needle.length === 0) return null;
  const ranges = collectThreadFindRanges(root, needle);
  if (ranges.length === 0) return null;
  const safe = Math.min(Math.max(activeIndex, 0), ranges.length - 1);
  return ranges[safe]?.startContainer.parentElement ?? null;
}
