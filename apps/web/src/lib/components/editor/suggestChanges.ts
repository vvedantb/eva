"use client";

import { Mark, Extension, type Editor, type Content } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import {
  suggestChanges,
  suggestChangesKey,
  isSuggestChangesEnabled,
  transformToSuggestionTransaction,
  applySuggestion,
  revertSuggestion,
  applySuggestions,
  revertSuggestions,
  selectSuggestion,
} from "@handlewithcare/prosemirror-suggest-changes";

/**
 * Mirrors the library's `SuggestionId` (not re-exported from the package
 * root). A suggestion's id is its mark `id` attr — string in our case.
 */
type SuggestionId = string | number;

/**
 * Suggestion mode (track changes) for the collaborative doc editor.
 *
 * Built on @handlewithcare/prosemirror-suggest-changes: edits made while the
 * mode is enabled are converted into `insertion` / `deletion` / `modification`
 * marks rather than mutating the document, so they sync to every collaborator
 * via prosemirror-sync (the marks ride the same steps) and can be accepted or
 * rejected. The backend markdown mirror already drops `deletion` text and keeps
 * insertion text, so the mirror reflects the accepted state.
 *
 * The marks below are native TipTap re-implementations of the library's mark
 * specs (matching names/excludes so the library's commands resolve them by
 * name from the schema). All clients share this schema, so synced docs stay
 * consistent.
 */

type SuggestionKind = "insertion" | "deletion" | "modification";

/** A suggestion id encodes its author and creation time: `userId|createdAt|rand`. */
function makeSuggestionId(userId: string | null): string {
  const author = userId ?? "unknown";
  // A short random suffix keeps distinct edits in the same millisecond unique;
  // the library reuses an adjacent mark's id when extending one, so continuity
  // of a single suggestion is preserved without us tracking it.
  const rand = Math.random().toString(36).slice(2, 8);
  return `${author}|${Date.now()}|${rand}`;
}

/** Decodes the author/time packed into a suggestion id. */
function parseSuggestionAuthor(id: string): {
  userId: string | null;
  createdAt: number | null;
} {
  const parts = id.split("|");
  if (parts.length < 2) return { userId: null, createdAt: null };
  const userId = parts[0] && parts[0] !== "unknown" ? parts[0] : null;
  const ts = Number(parts[1]);
  return { userId, createdAt: Number.isFinite(ts) ? ts : null };
}

const Insertion = createInlineSuggestionMark({
  name: "insertion",
  tag: "ins",
  excludes: "deletion modification insertion",
});

const Deletion = createInlineSuggestionMark({
  name: "deletion",
  tag: "del",
  excludes: "insertion modification deletion",
});

const Modification = Mark.create({
  name: "modification",
  inclusive: false,
  excludes: "deletion insertion",
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => parseDataId(element),
        renderHTML: (attributes) =>
          attributes.id === null
            ? {}
            : { "data-id": JSON.stringify(attributes.id) },
      },
      // These persist via ProseMirror JSON (synced); they are not rendered to
      // the DOM because the library reads them off the mark attrs directly.
      type: { default: null, rendered: false },
      attrName: { default: null, rendered: false },
      previousValue: { default: null, rendered: false },
      newValue: { default: null, rendered: false },
    };
  },
  parseHTML() {
    return [
      { tag: "span[data-type='modification']" },
      { tag: "div[data-type='modification']" },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, "data-type": "modification" }, 0];
  },
});

/** insertion/deletion share an identical spec apart from name/tag/excludes. */
function createInlineSuggestionMark(config: {
  name: SuggestionKind;
  tag: "ins" | "del";
  excludes: string;
}) {
  return Mark.create({
    name: config.name,
    inclusive: false,
    excludes: config.excludes,
    addAttributes() {
      return {
        id: {
          default: null,
          parseHTML: (element) => parseDataId(element),
          renderHTML: (attributes) =>
            attributes.id === null
              ? {}
              : { "data-id": JSON.stringify(attributes.id) },
        },
      };
    },
    parseHTML() {
      return [{ tag: `${config.tag}[data-id]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [config.tag, HTMLAttributes, 0];
    },
  });
}

/** Reads a suggestion id from a `data-id` attribute (stored JSON-encoded). */
function parseDataId(element: HTMLElement): SuggestionId | null {
  const raw = element.getAttribute("data-id");
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string" || typeof parsed === "number") return parsed;
    return raw;
  } catch {
    return raw;
  }
}

export interface SuggestChangesKitOptions {
  /** Resolves the current user id, used to attribute new suggestions. */
  getUserId: () => string | null;
}

/**
 * Bundles the three suggestion marks, the suggest-changes plugin, and the
 * dispatch interceptor that turns edits into tracked changes when enabled.
 *
 * The interceptor replicates the library's `withSuggestChanges` guard exactly:
 * it never re-tracks remote (`collab$`) steps, history (`history$`) steps,
 * y-sync steps, or transactions explicitly flagged to skip — so accept/reject
 * and other clients' edits pass through untouched.
 */
export const SuggestChangesKit = Extension.create<SuggestChangesKitOptions>({
  name: "suggestChangesKit",

  addOptions() {
    return { getUserId: () => null };
  },

  addExtensions() {
    return [Insertion, Deletion, Modification];
  },

  addProseMirrorPlugins() {
    return [suggestChanges()];
  },

  dispatchTransaction({ transaction, next }) {
    const { editor, options } = this;
    const state = editor.state;
    const ySyncMeta = transaction.getMeta("y-sync$") ?? {};
    const suggestMeta = transaction.getMeta(suggestChangesKey) ?? {};
    const shouldTrack =
      isSuggestChangesEnabled(state) &&
      !transaction.getMeta("history$") &&
      !transaction.getMeta("collab$") &&
      !ySyncMeta.isUndoRedoOperation &&
      !ySyncMeta.isChangeOrigin &&
      !("skip" in suggestMeta);

    next(
      shouldTrack
        ? transformToSuggestionTransaction(transaction, state, () =>
            makeSuggestionId(options.getUserId()),
          )
        : transaction,
    );
  },
});

/** Enables suggestion tracking for this client (local plugin state only). */
export function enableSuggesting(editor: Editor): void {
  editor.view.dispatch(
    editor.state.tr.setMeta(suggestChangesKey, { enabled: true }),
  );
}

/** Disables suggestion tracking for this client. */
export function disableSuggesting(editor: Editor): void {
  editor.view.dispatch(
    editor.state.tr.setMeta(suggestChangesKey, { enabled: false }),
  );
}

export interface SuggestionInfo {
  id: string;
  kind: SuggestionKind;
  userId: string | null;
  createdAt: number | null;
  from: number;
  to: number;
  text: string;
}

/** Walks the document and groups suggestion marks by id for the review panel. */
export function collectSuggestions(doc: PMNode): SuggestionInfo[] {
  const byId = new Map<string, SuggestionInfo>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      const kind = toSuggestionKind(mark.type.name);
      if (!kind) continue;
      const id = String(mark.attrs.id);
      const start = pos;
      const end = pos + node.nodeSize;
      const existing = byId.get(id);
      if (existing) {
        existing.from = Math.min(existing.from, start);
        existing.to = Math.max(existing.to, end);
        existing.text += node.text ?? "";
      } else {
        const { userId, createdAt } = parseSuggestionAuthor(id);
        byId.set(id, {
          id,
          kind,
          userId,
          createdAt,
          from: start,
          to: end,
          text: node.text ?? "",
        });
      }
    }
    return true;
  });
  return [...byId.values()].sort((a, b) => a.from - b.from);
}

function toSuggestionKind(markName: string): SuggestionKind | null {
  if (
    markName === "insertion" ||
    markName === "deletion" ||
    markName === "modification"
  ) {
    return markName;
  }
  return null;
}

/**
 * Accept/reject commands dispatch with a `skip` flag so the interceptor does
 * not re-track the resolution itself (the suggester may still be in suggesting
 * mode when accepting their own change).
 */
function dispatchSkip(editor: Editor): (tr: Transaction) => void {
  return (tr) =>
    editor.view.dispatch(tr.setMeta(suggestChangesKey, { skip: true }));
}

export function acceptSuggestion(editor: Editor, id: SuggestionId): void {
  applySuggestion(id)(editor.state, dispatchSkip(editor));
}

export function rejectSuggestion(editor: Editor, id: SuggestionId): void {
  revertSuggestion(id)(editor.state, dispatchSkip(editor));
}

export function acceptAllSuggestions(editor: Editor): void {
  applySuggestions(editor.state, dispatchSkip(editor));
}

export function rejectAllSuggestions(editor: Editor): void {
  revertSuggestions(editor.state, dispatchSkip(editor));
}

/** Moves the selection to a suggestion so the editor scrolls it into view. */
export function revealSuggestion(editor: Editor, id: SuggestionId): void {
  selectSuggestion(id)(editor.state, dispatchSkip(editor));
  editor.view.focus();
}

/**
 * Replaces the editor content without the replacement being captured as a
 * tracked suggestion. Used by version restore, which must apply verbatim even
 * while Suggesting mode is on. Chained commands share one transaction, so the
 * skip meta set first applies to the setContent step.
 */
export function setContentUntracked(editor: Editor, content: Content): void {
  editor
    .chain()
    .command(({ tr }) => {
      tr.setMeta(suggestChangesKey, { skip: true });
      return true;
    })
    .setContent(content, { emitUpdate: true })
    .run();
}
