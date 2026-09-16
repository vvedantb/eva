"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api, type Id } from "@eva/backend";
import {
  Button,
  ButtonGroup,
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
  IconCheck,
  IconChevronDown,
  IconDots,
  IconExternalLink,
  IconGitPullRequestClosed,
  IconLink,
  IconMessagePlus,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import type { ReviewTab } from "@/lib/search-params";
import { focusPrComposer } from "./prComposerFocus";
import { PrCloseDialog } from "./PrCloseDialog";
import { PrPrimaryAction } from "./PrPrimaryAction";
import { PrVerdictDialog, type PrVerdict } from "./PrVerdictDialog";
import type { PrOverview } from "./prOverviewMeta";
import { ConfirmSkipHint, requestConfirm, useAltHeld } from "@/lib/confirm";

/**
 * The header's right-hand cluster: everything a reader can *do* to this pull
 * request, in one place, ordered by how loud it is.
 *
 * Overflow first (the housekeeping nobody scans for), then the review verdict as
 * a split control, then the one filled button that decides the pull request's
 * fate. It used to be two unlabelled icon buttons up here and a merge box six
 * screens down; a reviewer who had finished reading had to scroll back through
 * the conversation to act on it.
 *
 * The split is deliberate: "Add comment" and "Approve" are the same gesture at
 * two levels of commitment, so they share a control rather than competing for
 * width as two buttons.
 */
export function PrHeaderActions({
  repoId,
  overview,
  refreshing,
  onRefresh,
  onTabChange,
  onChanged,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  refreshing: boolean;
  onRefresh: () => void;
  /** Used to reveal the Activity tab before putting the cursor in its composer. */
  onTabChange: (tab: ReviewTab) => void;
  /** Re-reads the overview after something on GitHub changed. */
  onChanged: () => void;
}) {
  const update = useAction(api.github.updatePullRequest);
  const [verdict, setVerdict] = useState<PrVerdict | null>(null);
  const [closing, setClosing] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const altHeld = useAltHeld();

  const isOpen = overview.status === "open";

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
    <div className="flex shrink-0 items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="size-7 p-0 max-sm:size-10"
            aria-label="More actions"
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
          {isOpen ? (
            <>
              <DropdownMenuSeparator />
              {/* Closing notifies every reviewer and stops CI, so it asks
                  first — the same bar merge is held to one control over. The
                  Radix `onSelect` event carries no modifier, so only the
                  Alt-held store can skip it. */}
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

      {/* Commenting outlives the pull request — a merged branch still gets
          questions, and GitHub keeps the thread open. Only the *verdict* half
          goes away: a review submitted after the merge changes nothing. */}
      <ButtonGroup>
        <Button
          size="sm"
          variant="outline"
          onClick={() => focusPrComposer(overview.number, onTabChange)}
        >
          <IconMessagePlus size={14} aria-hidden />
          <span className="max-sm:hidden">Add comment</span>
        </Button>
        {isOpen ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="px-1.5"
                aria-label="Submit a review"
              >
                <IconChevronDown size={14} aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setVerdict("APPROVE")}>
                <IconCheck size={14} aria-hidden />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setVerdict("REQUEST_CHANGES")}>
                <IconX size={14} aria-hidden />
                Request changes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </ButtonGroup>

      <PrPrimaryAction
        repoId={repoId}
        overview={overview}
        onDone={onChanged}
      />

      <PrVerdictDialog
        repoId={repoId}
        prNumber={overview.number}
        verdict={verdict}
        onClose={() => setVerdict(null)}
        onSubmitted={onChanged}
      />

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
