"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Button, ListEnter } from "@vvedantb/ui";
import { IconX } from "@tabler/icons-react";
import { CommentFilterTab } from "@/lib/components/CommentFilterTab";
import {
  PreviewCommentCard,
  type PreviewComment,
} from "./PreviewCommentCard";
import type { Id } from "@eva/backend";
import { useIframeBox, type IframeBox } from "./useIframeBox";

const DRAWER_MAX_WIDTH = 320;
/** Keeps part of the app visible beside the drawer in a narrow pane. */
const DRAWER_MAX_SHARE = 0.62;

/** The drawer's width over an iframe box; the action bar centres beside it. */
export function previewCommentsDrawerWidth(box: IframeBox): number {
  return Math.min(DRAWER_MAX_WIDTH, Math.round(box.width * DRAWER_MAX_SHARE));
}

/** Path only: `/a/?x=1#y` and `/a` are the same page. */
function pagePathname(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** Comments grouped by page, newest group first (input is newest first). */
function groupByPage(
  comments: readonly PreviewComment[],
): { pagePath: string; comments: PreviewComment[] }[] {
  const groups = new Map<string, PreviewComment[]>();
  for (const comment of comments) {
    const key = pagePathname(comment.pagePath);
    const group = groups.get(key);
    if (group) group.push(comment);
    else groups.set(key, [comment]);
  }
  return [...groups].map(([pagePath, group]) => ({
    pagePath,
    comments: group,
  }));
}

/**
 * Lists the chat's preview annotations over the right of the preview. A body
 * portal on the iframe box, like the action bar: the iframe paints in the
 * fixed z-40 host overlay, above the pane.
 */
export function PreviewCommentsDrawer({
  iframeElement,
  comments,
  previewPath,
  onViewInChat,
  onClose,
}: {
  iframeElement: HTMLIFrameElement | null;
  comments: readonly PreviewComment[];
  previewPath: string;
  onViewInChat: (messageId: Id<"messages">) => void;
  onClose: () => void;
}) {
  const box = useIframeBox(iframeElement);
  // The iframe paints 0×0 while its pane is hidden.
  if (!box || box.width === 0 || box.height === 0) return null;
  return (
    <DrawerPanel
      box={box}
      comments={comments}
      previewPath={previewPath}
      onViewInChat={onViewInChat}
      onClose={onClose}
    />
  );
}

function DrawerPanel({
  box,
  comments,
  previewPath,
  onViewInChat,
  onClose,
}: {
  box: IframeBox;
  comments: readonly PreviewComment[];
  previewPath: string;
  onViewInChat: (messageId: Id<"messages">) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"page" | "all">("page");
  const currentPage = pagePathname(previewPath);
  const onPage = comments.filter(
    (comment) => pagePathname(comment.pagePath) === currentPage,
  );
  const width = previewCommentsDrawerWidth(box);
  const groups =
    scope === "all"
      ? groupByPage(comments)
      : [{ pagePath: currentPage, comments: onPage }];
  const shown = scope === "all" ? comments : onPage;

  return createPortal(
    <div
      data-testid="preview-comments-drawer"
      className="fixed z-50 flex flex-col bg-background smooth-shadow-ring-lg"
      style={{
        left: box.left + box.width - width,
        top: box.top,
        width,
        height: box.height,
      }}
      // Only while focus is in the drawer: keys typed into the preview go to
      // the iframe's own document.
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
        <span className="text-sm font-medium">Comments</span>
        <Button
          size="icon-sm"
          variant="ghost"
          className="sm:size-6"
          aria-label="Close comments"
          onClick={onClose}
        >
          <IconX size={14} aria-hidden />
        </Button>
      </div>
      <div className="flex items-center gap-1 px-3 py-1.5 max-sm:gap-2.5">
        <CommentFilterTab
          active={scope === "page"}
          onSelect={() => setScope("page")}
        >
          On this page ({onPage.length})
        </CommentFilterTab>
        <CommentFilterTab
          active={scope === "all"}
          onSelect={() => setScope("all")}
        >
          All comments ({comments.length})
        </CommentFilterTab>
      </div>
      <div className="scrollbar scroll-fade flex-1 overflow-y-auto p-3">
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {scope === "page"
              ? "No comments on this page. Use Select element to add one."
              : "No comments yet. Use Select element to add one."}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <section key={group.pagePath} className="flex flex-col gap-2">
                {scope === "all" ? (
                  <h3 className="truncate px-0.5 font-mono text-2xs text-muted-foreground">
                    {group.pagePath}
                  </h3>
                ) : null}
                {group.comments.map((comment, index) => (
                  <ListEnter key={comment.id} index={index} fast>
                    <PreviewCommentCard
                      comment={comment}
                      onViewInChat={onViewInChat}
                    />
                  </ListEnter>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
