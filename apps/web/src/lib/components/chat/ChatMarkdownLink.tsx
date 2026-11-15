"use client";

import type { ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import { parseGithubPrLink, type GithubPrLink } from "@eva/shared";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  MarkdownLink,
  Spinner,
} from "@vvedantb/ui";
import { statusMeta } from "@/lib/components/reviews/_components/prOverviewMeta";
import {
  PrAvatar,
  PrDiffStat,
} from "@/lib/components/reviews/_components/prReviewParts";
import { relativeTime } from "@/lib/components/artifacts/_format";

/**
 * The `a` renderer for chat markdown. A GitHub pull request link gets a hover
 * card with its state, title, author and diff size; every other link renders
 * as the shared `MarkdownLink`.
 */
export function ChatMarkdownLink(props: ComponentProps<typeof MarkdownLink>) {
  const pr =
    typeof props.href === "string" ? parseGithubPrLink(props.href) : null;
  if (pr === null) return <MarkdownLink {...props} />;
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span>
          <MarkdownLink {...props} />
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" side="top" className="w-80 p-3">
        <PullRequestCardBody pr={pr} />
      </HoverCardContent>
    </HoverCard>
  );
}

/** Shared by every chat surface that renders markdown. */
export const CHAT_MARKDOWN_COMPONENTS = { a: ChatMarkdownLink };

/** Mounts only while the card is open, so a link costs nothing until hovered. */
function PullRequestCardBody({ pr }: { pr: GithubPrLink }) {
  const getCard = useAction(api.github.getPullRequestCard);
  const card = useQuery({
    queryKey: ["pr", "card", pr.owner, pr.name, pr.prNumber] as const,
    queryFn: () => getCard(pr),
    staleTime: 60_000,
  });
  const ref = `${pr.owner}/${pr.name} #${pr.prNumber}`;

  if (card.isPending) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        {ref}
      </div>
    );
  }
  if (card.isError || card.data === null) {
    return (
      <div className="text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{ref}</p>
        <p className="mt-1">
          {card.isError
            ? "Could not load this pull request."
            : "No access to this repository in Eva."}
        </p>
      </div>
    );
  }

  const data = card.data;
  const status = statusMeta(data.status, data.draft);
  const StatusIcon = status.icon;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium ${status.className}`}
        >
          <StatusIcon size={12} />
          {status.label}
        </span>
        <span className="min-w-0 truncate">{ref}</span>
        <span className="ml-auto shrink-0">
          {relativeTime(Date.parse(data.updatedAt))}
        </span>
      </div>
      <p className="line-clamp-3 text-sm font-medium leading-snug text-foreground">
        {data.title}
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <PrAvatar login={data.authorLogin} avatarUrl={data.authorAvatarUrl} />
        <span className="min-w-0 truncate">{data.authorLogin ?? "Unknown"}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <PrDiffStat
            additions={data.additions}
            deletions={data.deletions}
            className="rounded-md bg-muted/60 px-1.5 py-0.5"
          />
          <span className="rounded-md bg-muted/60 px-1.5 py-0.5">
            {data.changedFiles === 1
              ? "1 file"
              : `${data.changedFiles.toLocaleString()} files`}
          </span>
        </span>
      </div>
    </div>
  );
}
