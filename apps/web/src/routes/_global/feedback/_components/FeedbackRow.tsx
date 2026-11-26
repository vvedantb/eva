import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { IconThumbDown, IconThumbUp } from "@tabler/icons-react";
import dayjs from "dayjs";
import {
  chatSourceLabel,
  chatSourceRoute,
} from "@/lib/components/sandbox/chatSource";

export type FeedbackListRow = FunctionReturnType<
  typeof api.feedback.list
>[number];

/** One feedback item: the thumb, the comment, who sent it and from which chat. */
export function FeedbackRow({ row }: { row: FeedbackListRow }) {
  const Icon = row.sentiment === "positive" ? IconThumbUp : IconThumbDown;
  const from =
    row.author === "agent"
      ? `Eva, in ${row.userName ?? "a user"}'s chat`
      : (row.userName ?? "A user");
  const route = row.source ? chatSourceRoute(row.source, "documents") : null;

  return (
    <article className="flex gap-3 rounded-surface bg-card px-4 py-3">
      <Icon
        size={16}
        className="mt-0.5 shrink-0 text-muted-foreground"
        aria-label={row.sentiment === "positive" ? "Positive" : "Negative"}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          className={
            row.comment
              ? "text-sm text-pretty text-foreground"
              : "text-sm text-muted-foreground"
          }
        >
          {row.comment ?? "No comment"}
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span data-pii>{from}</span>
          <span aria-hidden>·</span>
          {row.source && route ? (
            <Link
              to={route.to}
              params={route.params}
              search={row.messageId ? { message: row.messageId } : {}}
              className="min-w-0 truncate hover:text-foreground"
            >
              {row.source.owner}/{row.source.repo} ·{" "}
              {chatSourceLabel(row.source)}
            </Link>
          ) : null}
          <span aria-hidden>·</span>
          <time dateTime={new Date(row.createdAt).toISOString()}>
            {dayjs(row.createdAt).format("MMM D, h:mm A")}
          </time>
        </p>
      </div>
    </article>
  );
}
