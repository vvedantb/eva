"use client";

import type { ComponentProps, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useQuery as useConvexQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import {
  parseEvaEntityLink,
  parseGithubItemLink,
  type EvaEntityLink,
  type GithubItemLink,
} from "@eva/shared";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  MarkdownLink,
  Spinner,
} from "@vvedantb/ui";
import {
  IconCircleCheck,
  IconCircleDot,
  IconCircleOff,
  IconMessageCircle,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { statusMeta } from "@/lib/components/reviews/_components/prOverviewMeta";
import { PrDiffStat } from "@/lib/components/reviews/_components/prReviewParts";
import {
  LINK_CARD_META_CHIP_CLASS,
  LinkPreviewCard,
} from "@/lib/components/mentions/LinkPreviewCard";
import { DataMentionHoverCardBody } from "@/lib/components/mentions";
import { MentionContentPreview } from "@/lib/components/mentions/MentionContentPreview";

/**
 * The `a` renderer for chat markdown. A GitHub pull request or issue link gets a
 * card with its state, title and author; a link to an Eva session, quick
 * task, project or doc gets the same card its `@` mention chip shows. Every
 * other link renders as the shared `MarkdownLink`.
 */
export function ChatMarkdownLink(props: ComponentProps<typeof MarkdownLink>) {
  const href = typeof props.href === "string" ? props.href : null;
  const github = href === null ? null : parseGithubItemLink(href);
  if (github !== null) {
    return (
      <LinkHoverCard link={props} contentClassName="w-80 p-3">
        {github.kind === "pull" ? (
          <PullRequestCardBody link={github} />
        ) : (
          <IssueCardBody link={github} />
        )}
      </LinkHoverCard>
    );
  }
  const entity =
    href === null ? null : parseEvaEntityLink(href, window.location.origin);
  if (entity !== null) {
    return (
      <LinkHoverCard
        link={props}
        contentClassName="w-auto border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
      >
        <EvaEntityCardBody link={entity} />
      </LinkHoverCard>
    );
  }
  return <MarkdownLink {...props} />;
}

function LinkHoverCard({
  link,
  contentClassName,
  children,
}: {
  link: ComponentProps<typeof MarkdownLink>;
  contentClassName: string;
  children: ReactNode;
}) {
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span>
          <MarkdownLink {...link} />
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" side="top" className={contentClassName}>
        {children}
      </HoverCardContent>
    </HoverCard>
  );
}

function EvaEntityCardBody({ link }: { link: EvaEntityLink }) {
  const target = useConvexQuery(api.mentions.getEntityByPath, link);
  if (target === undefined) {
    return (
      <MentionContentPreview title="Loading…">
        <Spinner className="size-4" />
      </MentionContentPreview>
    );
  }
  if (target === null) {
    return (
      <MentionContentPreview title="Not found">
        <p>This link may point to something deleted or in another team.</p>
      </MentionContentPreview>
    );
  }
  return (
    <DataMentionHoverCardBody
      entityId={target.entityId}
      repoId={target.repoId}
    />
  );
}

/** Shared by every chat surface that renders markdown. */
export const CHAT_MARKDOWN_COMPONENTS = { a: ChatMarkdownLink };

function PullRequestCardBody({ link }: { link: GithubItemLink }) {
  const getCard = useAction(api.github.getPullRequestCard);
  const card = useQuery({
    queryKey: ["pr", "card", link.owner, link.name, link.number] as const,
    queryFn: () =>
      getCard({ owner: link.owner, name: link.name, prNumber: link.number }),
    staleTime: 60_000,
  });
  const ref = `${link.owner}/${link.name} #${link.number}`;
  if (card.isPending || card.isError || card.data === null) {
    return (
      <GithubCardFallback
        reference={ref}
        state={card}
        noun="pull request"
      />
    );
  }
  const data = card.data;
  const status = statusMeta(data.status, data.draft);
  return (
    <LinkPreviewCard
      pill={githubPill(status)}
      reference={ref}
      updatedAt={Date.parse(data.updatedAt)}
      title={data.title}
      author={{ name: data.authorLogin, avatarUrl: data.authorAvatarUrl }}
    >
      <PrDiffStat
        additions={data.additions}
        deletions={data.deletions}
        className={LINK_CARD_META_CHIP_CLASS}
      />
      <span className={LINK_CARD_META_CHIP_CLASS}>
        {data.changedFiles === 1
          ? "1 file"
          : `${data.changedFiles.toLocaleString()} files`}
      </span>
    </LinkPreviewCard>
  );
}

function IssueCardBody({ link }: { link: GithubItemLink }) {
  const getCard = useAction(api.github.getIssueCard);
  const card = useQuery({
    queryKey: ["issue", "card", link.owner, link.name, link.number] as const,
    queryFn: () =>
      getCard({ owner: link.owner, name: link.name, issueNumber: link.number }),
    staleTime: 60_000,
  });
  const ref = `${link.owner}/${link.name} #${link.number}`;
  if (card.isPending || card.isError || card.data === null) {
    return <GithubCardFallback reference={ref} state={card} noun="issue" />;
  }
  const data = card.data;
  return (
    <LinkPreviewCard
      pill={githubPill(ISSUE_STATUS[data.status])}
      reference={ref}
      updatedAt={Date.parse(data.updatedAt)}
      title={data.title}
      author={{ name: data.authorLogin, avatarUrl: data.authorAvatarUrl }}
    >
      <span className={`${LINK_CARD_META_CHIP_CLASS} flex items-center gap-1`}>
        <IconMessageCircle size={12} />
        {data.comments.toLocaleString()}
      </span>
    </LinkPreviewCard>
  );
}

const ISSUE_STATUS: Record<
  "open" | "completed" | "not_planned",
  { label: string; className: string; icon: TablerIcon }
> = {
  open: {
    label: "Open",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: IconCircleDot,
  },
  completed: {
    label: "Closed",
    className: "bg-status-code-review/10 text-status-code-review",
    icon: IconCircleCheck,
  },
  not_planned: {
    label: "Not planned",
    className: "bg-muted/60 text-muted-foreground",
    icon: IconCircleOff,
  },
};

function githubPill(status: {
  label: string;
  className: string;
  icon: TablerIcon;
}) {
  const StatusIcon = status.icon;
  return {
    label: status.label,
    className: status.className,
    icon: <StatusIcon size={12} />,
  };
}

function GithubCardFallback({
  reference,
  state,
  noun,
}: {
  reference: string;
  state: { isPending: boolean; isError: boolean };
  noun: string;
}) {
  if (state.isPending) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        {reference}
      </div>
    );
  }
  return (
    <div className="text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{reference}</p>
      <p className="mt-1">
        {state.isError
          ? `Could not load this ${noun}.`
          : "No access to this repository in Eva."}
      </p>
    </div>
  );
}
