"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  ListEnter,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@vvedantb/ui";
import { IconX } from "@tabler/icons-react";
import {
  PreviewCommentCard,
  type PreviewComment,
} from "./PreviewCommentCard";
import type { Id } from "@eva/backend";
import { useIframeBox, type IframeBox } from "./useIframeBox";

const DRAWER_MAX_WIDTH = 320;
const DRAWER_MAX_SHARE = 0.62;

/** The drawer's width over an iframe box; the action bar centres beside it. */
export function previewCommentsDrawerWidth(box: IframeBox): number {
  return Math.min(DRAWER_MAX_WIDTH, Math.round(box.width * DRAWER_MAX_SHARE));
}

const DRAWER_INSET = 8;

function pagePathname(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** Done: someone marked it resolved. Queued comments are always open. */
export function isResolved(comment: PreviewComment): boolean {
  return comment.kind === "message" && comment.resolved !== undefined;
}

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
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const currentPage = pagePathname(previewPath);
  const inScope = (comment: PreviewComment) =>
    scope === "all" || pagePathname(comment.pagePath) === currentPage;
  const inStatus = (comment: PreviewComment) =>
    isResolved(comment) === (status === "resolved");
  const withStatus = comments.filter(inStatus);
  const withScope = comments.filter(inScope);
  const onPageCount = withStatus.filter(
    (comment) => pagePathname(comment.pagePath) === currentPage,
  ).length;
  const resolvedCount = withScope.filter(isResolved).length;
  const shown = withStatus.filter(inScope);
  const width = previewCommentsDrawerWidth(box);
  const groups =
    scope === "all"
      ? groupByPage(shown)
      : [{ pagePath: currentPage, comments: shown }];

  return createPortal(
    <div
      data-testid="preview-comments-drawer"
      className="fixed z-50 flex flex-col overflow-hidden rounded-surface bg-background smooth-shadow-ring-lg"
      style={{
        left: box.left + box.width - width - DRAWER_INSET,
        top: box.top + DRAWER_INSET,
        width,
        height: box.height - DRAWER_INSET * 2,
      }}
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
      <div className="flex flex-col items-start gap-1.5 px-3 pb-1.5">
        <Tabs
          value={scope}
          onValueChange={(value) => {
            if (value === "page" || value === "all") setScope(value);
          }}
        >
          <TabsList
            size="sm"
            className="tabs-segmented"
            aria-label="Which pages"
          >
            <TabsTrigger value="page">On this page ({onPageCount})</TabsTrigger>
            <TabsTrigger value="all">
              All comments ({withStatus.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs
          value={status}
          onValueChange={(value) => {
            if (value === "open" || value === "resolved") setStatus(value);
          }}
        >
          <TabsList
            size="sm"
            className="tabs-segmented"
            aria-label="Open or resolved"
          >
            <TabsTrigger value="open">
              Open ({withScope.length - resolvedCount})
            </TabsTrigger>
            <TabsTrigger value="resolved">Resolved ({resolvedCount})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="scrollbar scroll-fade flex-1 overflow-y-auto p-3">
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {status === "resolved"
              ? "No resolved comments."
              : scope === "page"
                ? "No open comments on this page. Use Select element to add one."
                : "No open comments. Use Select element to add one."}
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
