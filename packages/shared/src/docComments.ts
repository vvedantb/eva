export type DocCommentFilter = "open" | "resolved";

type ThreadComment = { _id: string; parentId?: string; resolvedAt?: number };

export function docCommentThreads<T extends ThreadComment>(
  comments: readonly T[],
): { open: T[]; resolved: T[]; repliesByParent: Map<string, T[]> } {
  const roots = comments.filter((comment) => !comment.parentId);
  const repliesByParent = new Map<string, T[]>();
  for (const comment of comments) {
    if (!comment.parentId) continue;
    const replies = repliesByParent.get(comment.parentId) ?? [];
    replies.push(comment);
    repliesByParent.set(comment.parentId, replies);
  }
  return {
    open: roots.filter((comment) => comment.resolvedAt === undefined),
    resolved: roots.filter((comment) => comment.resolvedAt !== undefined),
    repliesByParent,
  };
}

/** The toasts when a thread action fails. */
export const DOC_COMMENT_ERRORS = {
  resolve: "Couldn't resolve comment",
  reopen: "Couldn't reopen comment",
  reply: "Couldn't post reply",
};
