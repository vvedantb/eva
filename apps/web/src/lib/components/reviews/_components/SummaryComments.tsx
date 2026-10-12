"use client";

import { useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@eva/ui";
import { IconArrowsSort, IconChevronRight } from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { PrCommentCard } from "./PrCommentCard";
import { NOTICE_CLASS, type PrOverview } from "./prOverviewMeta";
import { PrAvatar } from "./prReviewParts";
import { buildSummaryComments, type SummaryComment } from "./prSummaryComments";
import { SummarySection } from "./SummarySection";

/** What a first render carries; the recent remarks are the ones worth arriving for. */
const COMMENT_PAGE = 10;

/**
 * Summary's Comments section: people first, newest first by default, ten at a
 * time; bots folded into one group beneath them. A pull request with two hundred
 * remarks is two hundred markdown documents, and review bots write most of them.
 */
export function SummaryComments({ overview }: { overview: PrOverview }) {
  const [order, setOrder] = useLocalStorage<"newest" | "oldest">(
    "eva:pr-summary-comment-order",
    "newest",
  );
  const [shown, setShown] = useState(COMMENT_PAGE);
  const all = buildSummaryComments(overview);
  const ordered = order === "newest" ? [...all].reverse() : all;
  const people = ordered.filter((comment) => !comment.isBot);
  const bots = ordered.filter((comment) => comment.isBot);
  const visible = people.slice(0, shown);
  const hidden = people.length - visible.length;

  return (
    <SummarySection
      title={`Comments (${all.length}${overview.commentsTruncated ? "+" : ""})`}
      actions={
        <Button
          size="xs"
          variant="ghost"
          className="shrink-0"
          onClick={() => setOrder(order === "newest" ? "oldest" : "newest")}
          aria-label={
            order === "newest"
              ? "Show oldest comments first"
              : "Show newest comments first"
          }
        >
          <IconArrowsSort aria-hidden />
          {order === "newest" ? "Newest first" : "Oldest first"}
        </Button>
      }
    >
      {overview.commentsTruncated ? (
        <p className={`${NOTICE_CLASS} mb-2`}>
          This conversation is longer than one read. The most recent{" "}
          {overview.comments.length} are here;{" "}
          <a
            href={overview.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            open it on GitHub
          </a>{" "}
          to read the rest.
        </p>
      ) : null}
      {all.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((comment) => (
            <CommentEntry key={comment.key} comment={comment} />
          ))}
          {hidden > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setShown(shown + COMMENT_PAGE)}
            >
              Show {Math.min(hidden, COMMENT_PAGE)} more ({hidden} hidden)
            </Button>
          ) : null}
          {bots.length > 0 ? <BotGroup comments={bots} /> : null}
        </div>
      )}
    </SummarySection>
  );
}

function CommentEntry({ comment }: { comment: SummaryComment }) {
  return (
    <PrCommentCard
      authorLogin={comment.authorLogin}
      authorAvatarUrl={comment.authorAvatarUrl}
      action={comment.action}
      badge={
        comment.verdict === null ? null : (
          <span className="text-3xs font-medium text-muted-foreground">
            {comment.verdict}
          </span>
        )
      }
      at={comment.at}
      htmlUrl={comment.htmlUrl}
      body={comment.body}
      path={comment.path}
      line={comment.line}
    />
  );
}

/** Bot remarks, folded behind one row naming who wrote them and when. */
function BotGroup({ comments }: { comments: readonly SummaryComment[] }) {
  const authors = [
    ...new Map(
      comments.map((comment) => [comment.authorLogin, comment]),
    ).values(),
  ];
  const latest = comments[0]?.at ?? null;
  return (
    <Collapsible className="overflow-hidden rounded-lg bg-card">
      <CollapsibleTrigger className="group flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40">
        <span className="flex shrink-0 -space-x-1.5">
          {authors.slice(0, 3).map((author) => (
            <span
              key={author.authorLogin}
              className="relative flex rounded-full ring-2 ring-card"
            >
              <PrAvatar
                login={author.authorLogin}
                avatarUrl={author.authorAvatarUrl}
                className="size-5"
              />
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium">
            {comments.length} bot {comments.length === 1 ? "comment" : "comments"}
          </span>
          <span className="flex flex-wrap gap-x-1.5 text-2xs text-muted-foreground">
            {authors.length} {authors.length === 1 ? "author" : "authors"}
            {latest === null ? null : (
              <>
                {" · Latest "}
                <RelativeDateTime at={new Date(latest).getTime()} />
              </>
            )}
          </span>
        </span>
        <IconChevronRight
          size={13}
          aria-hidden
          className="shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1 px-1 pb-1">
          {comments.map((comment) => (
            <PrCommentCard
              key={comment.key}
              framed={false}
              authorLogin={comment.authorLogin}
              authorAvatarUrl={comment.authorAvatarUrl}
              action={comment.action}
              at={comment.at}
              htmlUrl={comment.htmlUrl}
              body={comment.body}
              path={comment.path}
              line={comment.line}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
