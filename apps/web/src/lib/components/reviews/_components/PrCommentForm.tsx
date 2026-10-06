"use client";

import { useMutation } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api, type Id } from "@eva/backend";
import { Button, Spinner, Textarea } from "@eva/ui";
import { prErrorMessage } from "@/lib/prReviewQueries";

/**
 * The composer's Comment mode: GitHub's conversation comment box. The draft is
 * owned by the composer above, so dismissing the popover keeps it.
 *
 * `onPosted` refetches the overview — the comment lives on GitHub, so the
 * timeline only learns about it by asking again.
 */
export function PrCommentForm({
  repoId,
  prNumber,
  body,
  onBodyChange,
  onPosted,
}: {
  repoId: Id<"githubRepos">;
  prNumber: number;
  body: string;
  onBodyChange: (body: string) => void;
  onPosted: () => void;
}) {
  const addComment = useAction(api.github.addPrComment);
  const post = useMutation({
    mutationFn: (text: string) => addComment({ repoId, prNumber, body: text }),
    onSuccess: onPosted,
  });

  const trimmed = body.trim();
  const submit = () => {
    if (trimmed.length > 0 && !post.isPending) post.mutate(trimmed);
  };

  return (
    <div className="space-y-2">
      <Textarea
        autoFocus
        className="min-h-24 text-sm"
        value={body}
        placeholder="Leave a comment"
        aria-label="Comment on this pull request"
        onChange={(event) => onBodyChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      {post.isError ? (
        <p className="text-xs text-destructive">
          {prErrorMessage(post.error, "Couldn't post the comment")}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {/* eva authenticates as its GitHub App, so the comment carries the
            app's identity rather than the reader's account. */}
        <p className="text-xs text-muted-foreground">Posted as the eva app.</p>
        <Button
          size="sm"
          onClick={submit}
          disabled={trimmed.length === 0 || post.isPending}
        >
          {post.isPending ? <Spinner size="sm" /> : null}
          Comment
        </Button>
      </div>
    </div>
  );
}
