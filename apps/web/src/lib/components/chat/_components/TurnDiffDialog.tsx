"use client";

import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api, type Id } from "@eva/backend";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@eva/ui";
import { DiffEntriesDialogBody } from "@/lib/components/reviews/_components/DiffEntriesDialogBody";
import { compareDiffQuery, prErrorMessage } from "@/lib/prReviewQueries";

/**
 * "Diff this turn": everything the agent committed between the checkpoints on
 * one assistant message. Controlled, so the message row can open it from both
 * the hover actions and the context menu.
 */
export function TurnDiffDialog({
  open,
  onOpenChange,
  repoId,
  beforeSha,
  afterSha,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: Id<"githubRepos">;
  beforeSha: string;
  afterSha: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">Changes in this turn</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {beforeSha.slice(0, 7)}...{afterSha.slice(0, 7)}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so an unopened row never fetches. */}
        {open ? (
          <TurnDiffBody
            repoId={repoId}
            beforeSha={beforeSha}
            afterSha={afterSha}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TurnDiffBody({
  repoId,
  beforeSha,
  afterSha,
}: {
  repoId: Id<"githubRepos">;
  beforeSha: string;
  afterSha: string;
}) {
  const getCompareDiff = useAction(api.github.getCompareDiff);
  const query = useQuery(
    compareDiffQuery(getCompareDiff, repoId, beforeSha, afterSha),
  );

  if (query.isPending) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (query.data === undefined) {
    return (
      <p className="py-10 text-center text-sm text-destructive">
        {prErrorMessage(query.error, "Couldn't load this turn's changes")}
      </p>
    );
  }

  if (query.data.unavailable) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        This turn&apos;s commits are not on GitHub yet.
      </p>
    );
  }

  return (
    <DiffEntriesDialogBody
      entries={query.data.entries}
      truncatedNotice={
        query.data.truncated ? (
          <p className="text-xs text-muted-foreground">
            This turn is too large to show in full.
          </p>
        ) : null
      }
    />
  );
}
