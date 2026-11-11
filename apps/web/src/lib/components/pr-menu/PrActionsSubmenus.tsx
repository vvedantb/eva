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
  ConfirmSkipHint,
  toast,
  useRequestConfirm,
} from "@vvedantb/ui";
import type { Id } from "@eva/backend";
import {
  IconExternalLink,
  IconGitPullRequest,
  IconGitPullRequestClosed,
  IconLink,
  IconStack2,
} from "@tabler/icons-react";
import { PrRow } from "./PrRow";
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
  title?: string;
  repoId: Id<"githubRepos">;
}

/** Up to this many PRs sit in the menu itself; more fold into one submenu. */
const INLINE_PR_LIMIT = 2;

const isLive = (pr: PrMenuPullRequest) =>
  pr.state === "open" || pr.state === "draft";

/**
 * The PR entries of a chat's "…" menu and right-click menu: one row per pull
 * request, drawn like the stack popover's (`PrRow`). Each opens the same
 * actions as the review header's menu — View on GitHub, Copy link, Stack a new
 * session, Close without merging — so a PR can be handled without opening its
 * review first. More than `INLINE_PR_LIMIT` PRs fold into one "Pull requests
 * (N)" submenu, open and draft first, so the chat's own actions stay in view.
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

  // Stable sort: the query's order holds inside each half.
  const ordered = [...prs].sort(
    (a, b) => Number(isLive(b)) - Number(isLive(a)),
  );
  const rows = ordered.map((pr) => (
    <Sub key={pr._id}>
      <SubTrigger className="max-w-80 items-start">
        {/* No branch line: a chat's PRs mostly share one session branch. */}
        <PrRow
          status={pr.state === "draft" ? "open" : pr.state}
          draft={pr.state === "draft"}
          title={pr.title}
          number={pr.prNumber}
          branch={undefined}
        />
      </SubTrigger>
      <SubContent>
        <PrActionItems variant={variant} pr={pr} iconSize={iconSize} />
      </SubContent>
    </Sub>
  ));

  if (prs.length <= INLINE_PR_LIMIT) return <>{rows}</>;

  return (
    <Sub>
      <SubTrigger>
        <IconGitPullRequest size={iconSize} aria-hidden />
        Pull requests ({prs.length})
      </SubTrigger>
      <SubContent>{rows}</SubContent>
    </Sub>
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
  const { request: requestConfirm } = useRequestConfirm();
  const { close } = useClosePullRequest();
  const { canStack, stack } = useStackNewSession();
  const live = isLive(pr);
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
