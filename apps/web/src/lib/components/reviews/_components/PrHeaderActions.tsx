"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api, type Id } from "@eva/backend";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  CrossfadeIcon,
  Spinner,
  toast,
} from "@eva/ui";
import {
  IconDots,
  IconExternalLink,
  IconGitPullRequestClosed,
  IconLink,
  IconRefresh,
} from "@tabler/icons-react";
import { PrCloseDialog } from "./PrCloseDialog";
import { PrPrimaryAction } from "./PrPrimaryAction";
import type { PrOverview } from "./prOverviewMeta";
import { ConfirmSkipHint, requestConfirm, useAltHeld } from "@/lib/confirm";

/**
 * The header's right-hand cluster, in t3code's order: the one filled button that
 * decides the pull request's fate, then a quiet overflow menu for everything
 * else. Commenting and the review verdict are not here — they live in the
 * floating composer, which is on screen from every tab.
 *
 * While a refresh runs, the overflow trigger wears the spinner in place of its
 * dots, so the reader sees the fetch without a control appearing or the row
 * shifting.
 */
export function PrHeaderActions({
  repoId,
  overview,
  refreshing,
  onRefresh,
  onChanged,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  refreshing: boolean;
  onRefresh: () => void;
  /** Re-reads the overview after something on GitHub changed. */
  onChanged: () => void;
}) {
  const update = useAction(api.github.updatePullRequest);
  const [closing, setClosing] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const altHeld = useAltHeld();

  const close = async () => {
    setClosing(true);
    try {
      await update({ repoId, prNumber: overview.number, state: "closed" });
      setConfirmingClose(false);
      toast.success("Pull request closed");
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not close the branch",
      );
    }
    setClosing(false);
  };

  const copyLink = () => {
    void navigator.clipboard
      .writeText(overview.htmlUrl)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Couldn't copy the link"));
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <PrPrimaryAction repoId={repoId} overview={overview} onDone={onChanged} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={
              refreshing ? "Refreshing pull request" : "More pull request actions"
            }
          >
            <CrossfadeIcon
              show={refreshing || closing}
              trueKey="loading"
              falseKey="idle"
              variant="soft"
              className="relative flex size-4 items-center justify-center"
              whenTrue={<Spinner size="sm" />}
              whenFalse={<IconDots size={16} aria-hidden />}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRefresh} disabled={refreshing}>
            <IconRefresh size={14} aria-hidden />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={copyLink}>
            <IconLink size={14} aria-hidden />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={overview.htmlUrl} target="_blank" rel="noopener noreferrer">
              <IconExternalLink size={14} aria-hidden />
              View on GitHub
            </a>
          </DropdownMenuItem>
          {overview.status === "open" ? (
            <>
              <DropdownMenuSeparator />
              {/* Closing notifies every reviewer and stops CI, so it asks
                  first. The Radix `onSelect` event carries no modifier, so only
                  the Alt-held store can skip it. */}
              <DropdownMenuItem
                className="text-destructive"
                disabled={closing}
                onSelect={() =>
                  requestConfirm(
                    altHeld,
                    () => setConfirmingClose(true),
                    () => {
                      void close();
                    },
                  )
                }
              >
                <IconGitPullRequestClosed size={14} aria-hidden />
                Close without merging
                <ConfirmSkipHint />
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <PrCloseDialog
        prNumber={overview.number}
        open={confirmingClose}
        onOpenChange={setConfirmingClose}
        onConfirm={() => void close()}
        closing={closing}
      />
    </div>
  );
}
