import type {
  Experimental_CompositionCandidate,
  Spec,
  UIElement,
} from "@json-render/core";
import { isBlockCandidate } from "./candidates";

function signature(element: Pick<UIElement, "type" | "props">): string {
  return `${element.type}:${JSON.stringify(element.props)}`;
}

function countBySignature(
  elements: Iterable<Pick<UIElement, "type" | "props">>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const element of elements) {
    const key = signature(element);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Appends any content block the composer left out to the end of the root.
 * Returns the number of blocks that had to be rescued, so the caller can log
 * a composition that keeps dropping content.
 */
export function appendMissingBlocks(
  spec: Spec,
  candidates: readonly Experimental_CompositionCandidate[],
): { spec: Spec; appended: number } {
  const root = spec.elements[spec.root];
  if (!root) return { spec, appended: 0 };

  const placed = countBySignature(Object.values(spec.elements));
  const children = [...(root.children ?? [])];
  const elements: Record<string, UIElement> = { ...spec.elements };
  let appended = 0;

  for (const candidate of candidates) {
    if (!isBlockCandidate(candidate)) continue;
    const key = signature(candidate.element);
    const remaining = placed.get(key) ?? 0;
    if (remaining > 0) {
      placed.set(key, remaining - 1);
      continue;
    }
    const id = `appended_${candidate.id}`;
    elements[id] = { ...structuredClone(candidate.element), children: [] };
    children.push(id);
    appended += 1;
  }

  if (appended === 0) return { spec, appended: 0 };
  elements[spec.root] = { ...root, children };
  return { spec: { ...spec, elements }, appended };
}
