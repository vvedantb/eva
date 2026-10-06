"use client";

import type { ReactNode } from "react";
import { cn } from "@eva/ui";
import { IconExternalLink, IconFileCode } from "@tabler/icons-react";
import { Markdown } from "@eva/ui/markdown";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { MARKDOWN_CLASS } from "./prOverviewMeta";
import { PrAvatar } from "./prReviewParts";

/**
 * One remark: who said it, what they did, when, and where in the code — then
 * their markdown. Summary's comment list and Timeline's conversation groups both
 * render this, so a comment reads the same wherever the reader meets it.
 *
 * `framed` draws t3code's card (a rounded tone-step box); the timeline nests
 * cards inside an already-indented group and leaves it off.
 */
export function PrCommentCard({
  authorLogin,
  authorAvatarUrl,
  action = "commented",
  badge,
  at,
  htmlUrl,
  body,
  path,
  line,
  framed = true,
}: {
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  action?: string;
  /** A verdict word ("Approved") beside the action. */
  badge?: ReactNode;
  at: string | null;
  htmlUrl: string;
  body: string;
  path?: string;
  line?: number | null;
  framed?: boolean;
}) {
  const hasBody = body.trim().length > 0;
  return (
    <article
      className={cn(
        "group min-w-0",
        framed ? "rounded-lg bg-card px-3 py-2.5" : "px-2 py-2",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <PrAvatar
          login={authorLogin}
          avatarUrl={authorAvatarUrl}
          className="mt-0.5 size-5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
            <span className="font-semibold text-foreground">
              {authorLogin ?? "ghost"}
            </span>
            <span className="text-muted-foreground">{action}</span>
            {badge}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            {at === null ? null : (
              <RelativeDateTime at={new Date(at).getTime()} />
            )}
            {path ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <IconFileCode size={11} aria-hidden className="shrink-0" />
                <span className="truncate font-mono">
                  {path}
                  {line === undefined || line === null ? "" : `:${line}`}
                </span>
              </span>
            ) : null}
          </div>
        </div>
        <a
          href={htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="reveal-on-hover -mr-1 shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:text-foreground max-sm:hit-target"
          aria-label="Open on GitHub"
        >
          <IconExternalLink size={12} aria-hidden />
        </a>
      </div>
      {hasBody ? (
        <Markdown className={cn(MARKDOWN_CLASS, "mt-2 min-w-0")}>{body}</Markdown>
      ) : null}
    </article>
  );
}
