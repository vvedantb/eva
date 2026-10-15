import { useEffect, useRef } from "react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { useTiptapSync } from "@convex-dev/prosemirror-sync/tiptap";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";

/** TipTap extensions every Eva doc editor starts from. */
export const baseDocEditorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  Markdown.configure({
    markedOptions: { gfm: true },
  }),
];

/**
 * Live prosemirror sync for one doc. Lazily creates the sync doc for legacy
 * docs that predate it. Shared by the Documents viewer and the sandbox panel.
 */
export function useDocSync(docId: Id<"docs">) {
  const sync = useTiptapSync(api.prosemirrorSync, docId);
  const ensureSyncDoc = useMutation(api.docs.ensureSyncDoc);
  const hasMigratedRef = useRef(false);

  const needsMigration =
    !sync.isLoading && sync.initialContent === null && "create" in sync;
  useEffect(() => {
    if (needsMigration && !hasMigratedRef.current) {
      hasMigratedRef.current = true;
      ensureSyncDoc({ id: docId });
    }
  }, [needsMigration, docId, ensureSyncDoc]);

  const isLoading =
    sync.isLoading || (!sync.extension && sync.initialContent === null);
  return { sync, isLoading };
}
