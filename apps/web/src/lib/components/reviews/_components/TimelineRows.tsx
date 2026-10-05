"use client";

import { useState, type ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@eva/ui";
import {
  IconChevronDown,
  IconGitCommit,
  IconGitMerge,
  IconGitPullRequest,
  IconGitPullRequestClosed,
  IconMessage,
} from "@tabler/icons-react";
import { Markdown } from "@eva/ui/markdown";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { PrCommentCard } from "./PrCommentCard";
import {
  MARKDOWN_CLASS,
  ReviewStateIcon,
  reviewStateMeta,
  shortSha,
  type PrCommit,
  type PrReviewEvent,
} from "./prOverviewMeta";
import { PrAvatar } from "./prReviewParts";
import type { ConversationEvent } from "./prTimelineItems";

/**
 * The rows on Timeline's rail. Each owns a 3rem gutter whose marker sits on the
 * rail and masks it with the canvas colour, so the rail reads as a thread rather
 * than a strikethrough.
 */
const ROW_CLASS = "relative mb-5 pl-12";

function Marker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "absolute top-1/2 left-0 z-10 flex size-8 -translate-y-1/2 items-center justify-center bg-background",
        className,
      )}
    >
      {children}
    </span>
  );
}

function IconMarker({
  icon,
  className,
  toneClassName = "text-muted-foreground",
}: {
  icon: ReactNode;
  className?: string;
  toneClassName?: string;
}) {
  return (
    <Marker className={className}>
      <span className={cn("flex size-7 items-center justify-center", toneClassName)}>
        {icon}
      </span>
    </Marker>
  );
}

function When({ at }: { at: number | string | null }) {
  if (at === null || at === 0) return null;
  return (
    <RelativeDateTime
      at={typeof at === "number" ? at : new Date(at).getTime()}
      className="text-[11px]"
    />
  );
}

/** A push. Pressing it opens the Code tab scoped to this commit. */
export function TimelineCommit({
  commit,
  onOpen,
}: {
  commit: PrCommit;
  onOpen: () => void;
}) {
  const headline = commit.message.split("\n")[0] ?? commit.message;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        ROW_CLASS,
        "group block w-full cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      aria-label={`View commit ${shortSha(commit.sha)} in Code`}
    >
      {commit.authorLogin === null && commit.authorAvatarUrl === null ? (
        <IconMarker icon={<IconGitCommit size={14} aria-hidden />} />
      ) : (
        <Marker>
          <PrAvatar
            login={commit.authorLogin}
            avatarUrl={commit.authorAvatarUrl}
            className="size-7"
          />
        </Marker>
      )}
      <div className="min-w-0 py-1.5">
        <div className="truncate text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
          {headline}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <code className="font-mono">{shortSha(commit.sha)}</code>
          {commit.authorLogin === null ? null : <span>{commit.authorLogin}</span>}
          <When at={commit.committedAt} />
        </div>
      </div>
    </button>
  );
}

/**
 * A run of remarks, folded behind one row naming how many and from whom. The
 * marker greys out while folded, so open conversations stand out on the rail.
 */
export function TimelineConversation({
  events,
}: {
  events: readonly ConversationEvent[];
}) {
  const [open, setOpen] = useState(false);
  const authors = [
    ...new Map(
      events.map((event) => {
        const author =
          event.kind === "comment"
            ? { login: event.comment.authorLogin, avatarUrl: event.comment.authorAvatarUrl }
            : { login: event.review.authorLogin, avatarUrl: event.review.authorAvatarUrl };
        return [author.login, author];
      }),
    ).values(),
  ];
  const first = authors[0];
  return (
    <div className={ROW_CLASS}>
      {first === undefined ? (
        <IconMarker icon={<IconMessage size={14} aria-hidden />} className="top-6" />
      ) : (
        <Marker className="top-6">
          <PrAvatar
            login={first.login}
            avatarUrl={first.avatarUrl}
            className={cn("size-7 transition-opacity", !open && "opacity-45 grayscale")}
          />
        </Marker>
      )}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full min-w-0 items-center gap-3 py-2 text-left transition-opacity hover:opacity-100",
            open ? "opacity-100" : "text-muted-foreground opacity-60",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold">
              {events.length} {events.length === 1 ? "comment" : "comments"}
            </span>
            <span className="flex gap-1 truncate text-[11px] text-muted-foreground">
              <span>
                {authors.length} {authors.length === 1 ? "author" : "authors"}
              </span>
              <span aria-hidden>·</span>
              <When at={events[0]?.at ?? null} />
            </span>
          </span>
          <IconChevronDown
            size={14}
            aria-hidden
            className={cn(
              "shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 space-y-1">
            {events.map((event) =>
              event.kind === "comment" ? (
                <PrCommentCard
                  key={event.key}
                  framed={false}
                  authorLogin={event.comment.authorLogin}
                  authorAvatarUrl={event.comment.authorAvatarUrl}
                  action={event.comment.path ? "commented on" : "commented"}
                  at={event.comment.createdAt}
                  htmlUrl={event.comment.htmlUrl}
                  body={event.comment.body}
                  path={event.comment.path}
                  line={event.comment.line}
                />
              ) : (
                <PrCommentCard
                  key={event.key}
                  framed={false}
                  authorLogin={event.review.authorLogin}
                  authorAvatarUrl={event.review.authorAvatarUrl}
                  action="reviewed"
                  at={event.review.submittedAt}
                  htmlUrl={event.review.htmlUrl}
                  body={event.review.body}
                />
              ),
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** Sentence form of a verdict, so the rail reads as prose. */
function verdictAction(state: string): string {
  if (state === "APPROVED") return "approved these changes";
  if (state === "CHANGES_REQUESTED") return "requested changes";
  return "had a review dismissed";
}

/**
 * A verdict, on its own row: the reviewer's face on the rail with the verdict's
 * glyph pinned to it, so "approved" reads from the same place a merge does.
 */
export function TimelineVerdict({
  review,
  stale,
}: {
  review: PrReviewEvent;
  stale: boolean;
}) {
  return (
    <div className={ROW_CLASS}>
      <Marker className="top-4">
        <span className="relative flex">
          <PrAvatar
            login={review.authorLogin}
            avatarUrl={review.authorAvatarUrl}
            className={cn("size-7", stale && "opacity-60")}
          />
          <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-background">
            <ReviewStateIcon state={review.state} />
          </span>
        </span>
      </Marker>
      <div className="min-w-0 py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-x-1.5">
          <a
            href={review.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground hover:underline"
          >
            {review.authorLogin}
          </a>
          <span className="text-muted-foreground">{verdictAction(review.state)}</span>
          <span className="sr-only">{reviewStateMeta(review.state).label}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <When at={review.submittedAt} />
          {stale ? <span>· before the latest push</span> : null}
        </div>
        {review.body.trim().length > 0 ? (
          <Markdown className={cn(MARKDOWN_CLASS, "mt-2")}>{review.body}</Markdown>
        ) : null}
      </div>
    </div>
  );
}

const LIFECYCLE = {
  opened: { icon: IconGitPullRequest, label: "opened this pull request" },
  merged: { icon: IconGitMerge, label: "merged this pull request" },
  closed: { icon: IconGitPullRequestClosed, label: "closed this pull request" },
} as const;

/** The opening, the merge, or the close. */
export function TimelineLifecycle({
  kind,
  at,
  actor,
}: {
  kind: keyof typeof LIFECYCLE;
  at: number;
  actor: string | null;
}) {
  const Icon = LIFECYCLE[kind].icon;
  return (
    <div className={ROW_CLASS}>
      <IconMarker
        icon={<Icon size={14} aria-hidden />}
        toneClassName={
          kind === "merged"
            ? "text-violet-600 dark:text-violet-400"
            : kind === "closed"
              ? "text-destructive"
              : undefined
        }
      />
      <div className="py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-foreground">{actor ?? "Someone"}</span>
          <span className="text-muted-foreground">{LIFECYCLE[kind].label}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          <When at={at} />
        </div>
      </div>
    </div>
  );
}
