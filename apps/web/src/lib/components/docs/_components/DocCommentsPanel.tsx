"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useQueryState } from "nuqs";
import { docCommentFilterParser } from "@/lib/search-params";
import { Button, cn, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconX } from "@tabler/icons-react";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { DocCommentThread } from "./DocCommentThread";
import { DocNewCommentComposer } from "./DocNewCommentComposer";
import { DOC_SIDE_PANEL_CLASS } from "./docSidePanel";

type DocComment = FunctionReturnType<typeof api.docComments.listByDoc>[number];

export function DocCommentsPanel({
  docId,
  allowAskEva = false,
  activeAnchorId,
  onAnchorClick,
  onClose,
  composingAnchorId,
  composingAnchorText,
  onCancelCompose,
  onCommentCreated,
  presentAnchorIds,
}: {
  docId: Id<"docs">;
  allowAskEva?: boolean;
  activeAnchorId: string | null;
  onAnchorClick: (anchorId: string) => void;
  onClose: () => void;
  composingAnchorId: string | null;
  composingAnchorText: string | null;
  onCancelCompose: () => void;
  onCommentCreated: () => void;
  presentAnchorIds: ReadonlySet<string>;
}) {
  const [filter, setFilter] = useQueryState("comments", docCommentFilterParser);
  const comments = useQuery(api.docComments.listByDoc, { docId }) ?? [];

  const roots = comments.filter((c) => !c.parentId);
  const openRoots = roots.filter((c) => c.resolvedAt === undefined);
  const resolvedRoots = roots.filter((c) => c.resolvedAt !== undefined);
  const displayRoots = filter === "open" ? openRoots : resolvedRoots;

  const repliesByParent = new Map<string, DocComment[]>();
  for (const c of comments) {
    if (c.parentId) {
      const arr = repliesByParent.get(c.parentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentId, arr);
    }
  }

  return (
    <div className={DOC_SIDE_PANEL_CLASS}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex max-sm:min-w-0 items-center gap-2">
          <span className="max-sm:truncate text-sm font-medium">Comments</span>
          <span className="max-sm:shrink-0 text-xs text-muted-foreground">
            {openRoots.length} open
          </span>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          // 24px on desktop, as before; `icon-sm` is 32px and only wanted on touch.
          className="sm:size-6"
          aria-label="Close comments"
          onClick={onClose}
        >
          <IconX size={14} aria-hidden />
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b border-border px-3 max-sm:py-1.5 max-sm:gap-2.5">
        <button
          type="button"
          onClick={() => setFilter("open")}
          className={cn(
            "max-sm:hit-target rounded-md px-2 max-sm:py-1 text-xs font-medium transition-colors",
            filter === "open"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Open ({openRoots.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("resolved")}
          className={cn(
            "max-sm:hit-target rounded-md px-2 max-sm:py-1 text-xs font-medium transition-colors",
            filter === "resolved"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Resolved ({resolvedRoots.length})
        </button>
      </div>

      <div className="scrollbar scroll-fade flex-1 overflow-y-auto">
        {composingAnchorId && (
          <div className="border-b border-border p-3">
            <DocNewCommentComposer
              docId={docId}
              anchorId={composingAnchorId}
              anchorText={composingAnchorText ?? ""}
              allowAskEva={allowAskEva}
              onCancel={onCancelCompose}
              onCreated={onCommentCreated}
            />
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={filter}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            {displayRoots.length === 0 && !composingAnchorId && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {filter === "open"
                  ? "No open comments. Select text to comment."
                  : "No resolved comments."}
              </p>
            )}

            {displayRoots.map((root, index) => (
              <ListEnter key={root._id} index={index} fast>
                <DocCommentThread
                  root={root}
                  replies={repliesByParent.get(root._id) ?? []}
                  docId={docId}
                  isActive={root.anchorId === activeAnchorId}
                  isOrphaned={
                    !!root.anchorId && !presentAnchorIds.has(root.anchorId)
                  }
                  onClick={() => {
                    if (root.anchorId) onAnchorClick(root.anchorId);
                  }}
                />
              </ListEnter>
            ))}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
