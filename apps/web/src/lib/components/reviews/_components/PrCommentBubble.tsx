"use client";

import type { ReactNode } from "react";
import { Surface } from "@eva/ui";
import { IconExternalLink } from "@tabler/icons-react";
import { Markdown } from "@eva/ui/markdown";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { MARKDOWN_CLASS } from "./prOverviewMeta";

interface PrCommentBubbleProps {
  authorLogin: string | null;
  /** What the author did, e.g. "commented" — GitHub's own phrasing. */
  action: string;
  at: string | null;
  htmlUrl: string;
  body: string;
  /** File an inline comment is anchored to. */
  path?: string;
  line?: number | null;
  /** Shown in place of the body when there is nothing to render. */
  emptyLabel?: string;
  /** Controls for this bubble, e.g. Edit on the description. */
  actions?: ReactNode;
}

/**
 * One speech bubble on the conversation: a line naming the author and what they
 * did, then their markdown. Used for standalone comments and review summaries
 * alike, so every piece of authored text on the tab reads the same way.
 *
 * A tonal fill and nothing else. A bubble is the one place on this surface that
 * genuinely needs a container — it is how one person's words are told from the
 * next — but it needs exactly one device to do it, where this had three: an
 * outline, a second tone for the header, and a rule between them. On a thread of
 * fifty comments those rules were most of what was on screen.
 *
 * The avatar is not here — the timeline owns the gutter so bubbles line up on a
 * single rail whatever kind of event they belong to.
 */
export function PrCommentBubble({
  authorLogin,
  action,
  at,
  htmlUrl,
  body,
  path,
  line,
  emptyLabel,
  actions,
}: PrCommentBubbleProps) {
  const hasBody = body.trim().length > 0;

  return (
    // Plain `group`, not `group/bubble`: `reveal-on-hover transition-opacity` keys off the
    // unnamed group, and nothing else in here needed the name.
    <Surface density="tight" className="group space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {authorLogin ?? "unknown"}
        </span>
        <span>{action}</span>
        {path ? (
          <span className="min-w-0 truncate rounded bg-muted/60 px-1 py-0.5 font-mono">
            {path}
            {line === undefined || line === null ? "" : `:${line}`}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          {at ? <RelativeDateTime at={new Date(at).getTime()} /> : null}
          <a
            href={htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="reveal-on-hover transition-opacity max-sm:hit-target hover:text-foreground"
            aria-label="View on GitHub"
          >
            <IconExternalLink size={12} aria-hidden />
          </a>
        </span>
      </div>

      {hasBody ? (
        <Markdown className={MARKDOWN_CLASS}>{body}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground">
          {emptyLabel ?? "Nothing written."}
        </p>
      )}
    </Surface>
  );
}
