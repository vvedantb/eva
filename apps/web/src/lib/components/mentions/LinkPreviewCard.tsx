"use client";

import type { ReactNode } from "react";
import { PrAvatar } from "@/lib/components/reviews/_components/prReviewParts";
import { relativeTime } from "@/lib/components/artifacts/_format";

/**
 * One hover card layout for every linked thing: GitHub pull requests and
 * issues (`ChatMarkdownLink`) and Eva sessions, quick tasks and projects
 * (`DataMentionHoverCardBody`). Header: a tone pill, the reference, the age.
 * Then the title, an optional line of detail, and the author with extra meta.
 * Draws no surface: the caller's hover card does.
 */
export function LinkPreviewCard({
  pill,
  reference,
  updatedAt,
  title,
  description,
  author,
  children,
}: {
  pill: { label: string; className: string; icon: ReactNode };
  reference: string | null;
  updatedAt: number | null;
  title: string;
  description?: string;
  author: { name: string | null; avatarUrl: string | null } | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium ${pill.className}`}
        >
          {pill.icon}
          {pill.label}
        </span>
        {reference !== null ? (
          <span className="min-w-0 truncate">{reference}</span>
        ) : null}
        {updatedAt !== null ? (
          <span className="ml-auto shrink-0">{relativeTime(updatedAt)}</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <p className="line-clamp-3 text-sm font-medium leading-snug text-foreground">
          {title}
        </p>
        {description !== undefined ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {author !== null || children !== undefined ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {author !== null ? (
            <>
              <PrAvatar login={author.name} avatarUrl={author.avatarUrl} />
              <span className="min-w-0 truncate">
                {author.name ?? "Unknown"}
              </span>
            </>
          ) : null}
          {children !== undefined ? (
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {children}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A small muted chip for the card's bottom-right meta. */
export const LINK_CARD_META_CHIP_CLASS =
  "rounded-control bg-muted/60 px-1.5 py-0.5";
