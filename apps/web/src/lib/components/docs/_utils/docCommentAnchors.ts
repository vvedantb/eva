"use client";

import { Mark, Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { suggestChangesKey } from "@handlewithcare/prosemirror-suggest-changes";

/**
 * In-document anchoring for comments.
 *
 * `DocCommentMark` is a neutral mark (`span[data-comment-anchor]`) carrying the
 * thread's anchorId. It rides prosemirror-sync steps, so the anchored range
 * follows concurrent edits and reaches every collaborator for free. The mark
 * itself is unstyled — all highlighting is applied by `DocCommentHighlight`'s
 * decorations, keyed on which anchors are currently *open*. That way resolving
 * a thread simply drops it from the open set and the highlight disappears
 * everywhere without touching the document (reopening restores it). The
 * backend markdown mirror ignores unknown marks, so anchors never leak into
 * `docs.content`.
 */

const MARK_NAME = "docComment";

export const DocCommentMark = Mark.create({
  name: MARK_NAME,
  // Distinct threads may overlap on the same text.
  excludes: "",
  // Typing at the edge of a commented range must not extend the comment.
  inclusive: false,
  addAttributes() {
    return {
      anchorId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-anchor"),
        renderHTML: (attributes) =>
          attributes.anchorId
            ? { "data-comment-anchor": attributes.anchorId }
            : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comment-anchor]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

export interface DocCommentHighlightState {
  openAnchorIds: ReadonlySet<string>;
  activeAnchorId: string | null;
}

const docCommentHighlightKey = new PluginKey<DocCommentHighlightState>(
  "docCommentHighlight",
);

export interface DocCommentHighlightOptions {
  onAnchorClick: (anchorId: string) => void;
}

export const DocCommentHighlight = Extension.create<DocCommentHighlightOptions>(
  {
    name: "docCommentHighlight",

    addOptions() {
      return { onAnchorClick: () => undefined };
    },

    addProseMirrorPlugins() {
      const options = this.options;
      return [
        new Plugin<DocCommentHighlightState>({
          key: docCommentHighlightKey,
          state: {
            init: () => ({
              openAnchorIds: new Set<string>(),
              activeAnchorId: null,
            }),
            apply: (tr, value) => tr.getMeta(docCommentHighlightKey) ?? value,
          },
          props: {
            decorations(state) {
              const pluginState = docCommentHighlightKey.getState(state);
              if (!pluginState) return DecorationSet.empty;
              const decorations: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (!node.isText) return true;
                for (const mark of node.marks) {
                  if (mark.type.name !== MARK_NAME) continue;
                  const anchorId = mark.attrs.anchorId;
                  if (typeof anchorId !== "string") continue;
                  if (!pluginState.openAnchorIds.has(anchorId)) continue;
                  decorations.push(
                    Decoration.inline(pos, pos + node.nodeSize, {
                      class:
                        anchorId === pluginState.activeAnchorId
                          ? "doc-comment-highlight doc-comment-highlight-active"
                          : "doc-comment-highlight",
                    }),
                  );
                }
                return true;
              });
              return DecorationSet.create(state.doc, decorations);
            },
            handleClick(_view, _pos, event) {
              const target = event.target;
              if (!(target instanceof Element)) return false;
              const el = target.closest("[data-comment-anchor]");
              const anchorId = el?.getAttribute("data-comment-anchor");
              if (!anchorId) return false;
              options.onAnchorClick(anchorId);
              // Don't swallow the click — cursor placement still works.
              return false;
            },
          },
        }),
      ];
    },
  },
);

/** Pushes the current open/active anchors into the highlight plugin. */
export function setCommentHighlightState(
  editor: Editor,
  state: DocCommentHighlightState,
): void {
  editor.view.dispatch(
    editor.state.tr
      .setMeta(docCommentHighlightKey, state)
      // Never let a highlight-only transaction become a tracked suggestion.
      .setMeta(suggestChangesKey, { skip: true }),
  );
}

/**
 * Marks the current selection with a comment anchor. The skip meta keeps the
 * mark from being recorded as a suggestion while in Suggesting mode.
 */
export function applyCommentAnchor(editor: Editor, anchorId: string): void {
  const { from, to } = editor.state.selection;
  if (from === to) return;
  const markType = editor.state.schema.marks[MARK_NAME];
  if (!markType) return;
  editor.view.dispatch(
    editor.state.tr
      .addMark(from, to, markType.create({ anchorId }))
      .setMeta(suggestChangesKey, { skip: true }),
  );
}

/** Removes a specific anchor's mark (composer cancel / failed submit). */
export function removeCommentAnchor(editor: Editor, anchorId: string): void {
  const markType = editor.state.schema.marks[MARK_NAME];
  if (!markType) return;
  const ranges = collectAnchorRanges(editor.state.doc, anchorId);
  if (ranges.length === 0) return;
  let tr = editor.state.tr;
  const mark = markType.create({ anchorId });
  for (const range of ranges) {
    tr = tr.removeMark(range.from, range.to, mark);
  }
  editor.view.dispatch(tr.setMeta(suggestChangesKey, { skip: true }));
}

/** All text ranges currently carrying the given anchor's mark. */
function collectAnchorRanges(
  doc: PMNode,
  anchorId: string,
): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type.name === MARK_NAME && mark.attrs.anchorId === anchorId) {
        ranges.push({ from: pos, to: pos + node.nodeSize });
      }
    }
    return true;
  });
  return ranges;
}

/** The set of anchorIds still present in the document (for orphan detection). */
export function collectPresentAnchorIds(doc: PMNode): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (
        mark.type.name === MARK_NAME &&
        typeof mark.attrs.anchorId === "string"
      ) {
        ids.add(mark.attrs.anchorId);
      }
    }
    return true;
  });
  return ids;
}

/** Scrolls the editor so the anchored range is visible. */
export function scrollToAnchor(editor: Editor, anchorId: string): void {
  const ranges = collectAnchorRanges(editor.state.doc, anchorId);
  const first = ranges[0];
  if (!first) return;
  const dom = editor.view.domAtPos(first.from);
  const el = dom.node instanceof Element ? dom.node : dom.node.parentElement;
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}
