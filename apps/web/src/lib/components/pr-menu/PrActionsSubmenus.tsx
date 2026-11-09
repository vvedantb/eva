"use client";

import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  toast,
} from "@eva/ui";
import type { Id } from "@eva/backend";
import {
  IconExternalLink,
  IconGitPullRequest,
  IconGitPullRequestClosed,
  IconLink,
  IconStack2,
} from "@tabler/icons-react";
import { ConfirmSkipHint, requestConfirm, useAltHeld } from "@/lib/confirm";
import { prStateIconClass } from "@/lib/components/prStateIconClass";
import { requestPrClose } from "./prCloseRequest";
import { useClosePullRequest } from "./useClosePullRequest";
import { useStackNewSession } from "./useStackNewSession";

/** The fields of a `pullRequests.listForOwner` row these menus need. */
export interface PrMenuPullRequest {
  _id: string;
  prUrl: string;
  prNumber: number;
  state: "draft" | "open" | "merged" | "closed";
  headBranch?: string;
  repoId: Id<"githubRepos">;
}

/**
 * The PR entry of a chat's "…" menu and right-click menu: "View PR" for one
 * pull request, or "PR #N" per pull request when the chat holds several. Each
 * opens the same actions as the review header's menu — View on GitHub, Copy
 * link, Stack a new session, Close without merging — so a PR can be handled
 * without opening its review first.
 */
export function PrActionsSubmenus({
  variant,
  prs,
}: {
  variant: "context" | "dropdown";
  prs: readonly PrMenuPullRequest[];
}) {
  const Sub = variant === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger =
    variant === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent =
    variant === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  const iconSize = variant === "context" ? 16 : 14;
  const many = prs.length > 1;

  return (
    <>
      {prs.map((pr) => (
        <Sub key={pr._id}>
          <SubTrigger>
            <IconGitPullRequest
              size={iconSize}
              className={prStateIconClass(pr.state)}
            />
            {many ? `PR #${pr.prNumber}` : "View PR"}
          </SubTrigger>
          <SubContent>
            <PrActionItems variant={variant} pr={pr} iconSize={iconSize} />
          </SubContent>
        </Sub>
      ))}
    </>
  );
}

function PrActionItems({
  variant,
  pr,
  iconSize,
}: {
  variant: "context" | "dropdown";
  pr: PrMenuPullRequest;
  iconSize: number;
}) {
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator =
    variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const altHeld = useAltHeld();
  const { close } = useClosePullRequest();
  const { canStack, stack } = useStackNewSession();
  const live = pr.state === "open" || pr.state === "draft";
  const headRef = pr.headBranch;
  const target = { repoId: pr.repoId, prNumber: pr.prNumber };

  return (
    <>
      <Item asChild>
        <a href={pr.prUrl} target="_blank" rel="noopener noreferrer">
          <IconExternalLink size={iconSize} aria-hidden />
          View on GitHub
        </a>
      </Item>
      <Item
        onSelect={() => {
          void navigator.clipboard
            .writeText(pr.prUrl)
            .then(() => toast.success("Link copied"))
            .catch(() => toast.error("Couldn't copy the link"));
        }}
      >
        <IconLink size={iconSize} aria-hidden />
        Copy link
      </Item>
      {live && headRef !== undefined && canStack(pr.repoId) ? (
        <Item
          onSelect={() =>
            stack({ repoId: pr.repoId, prNumber: pr.prNumber, headRef })
          }
        >
          <IconStack2 size={iconSize} aria-hidden />
          Stack a new session
        </Item>
      ) : null}
      {live ? (
        <>
          <Separator />
          {/* Closing notifies every reviewer and stops CI, so it asks first;
              Alt-held skips the dialog, as on the review header. */}
          <Item
            className="text-destructive"
            onSelect={() =>
              requestConfirm(
                altHeld,
                () => requestPrClose(target),
                () => {
                  void close(target);
                },
              )
            }
          >
            <IconGitPullRequestClosed size={iconSize} aria-hidden />
            Close without merging
            <ConfirmSkipHint />
          </Item>
        </>
      ) : null}
    </>
  );
}
