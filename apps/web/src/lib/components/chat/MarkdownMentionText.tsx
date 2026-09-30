"use client";

import type { MouseEvent, ReactNode } from "react";
import { Children } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Markdown, MarkdownLink } from "@eva/ui/markdown";
import remarkBreaks from "remark-breaks";
import {
  DataMentionChip,
  SkillMentionChip,
  UserMentionChip,
  LinkChip,
  isSkillTokenId,
  isHarnessSkillTokenId,
  isChipLinkUrl,
  MENTION_CHIP_CLASS,
  SKILL_CHIP_CLASS,
} from "@/lib/components/mentions";
import { ScreenshotPreview, VideoPreview } from "@/lib/components/MediaPreview";
import { useDataMentionNavigate } from "@/lib/useDataMentionNavigate";
import { remarkMentionChips, MENTION_HREF_REGEX } from "./remarkMentionChips";

interface MarkdownMentionTextProps {
  text: string;
  /** Repo route prefix, e.g. `/owner/repo` or `/owner/repo--app`. */
  repoBasePath: string;
  repoId: Id<"githubRepos">;
  className?: string;
  /**
   * What an `@` mention can refer to in this context. `"user"` (comments) mixes
   * People mentions with Data mentions, so each token's kind must be resolved
   * before choosing a chip. `"doc"` (descriptions/chat) only ever contains Data
   * mentions (docs/sessions/projects/quick tasks) — kept as the historical name
   * to avoid a wider rename. `/` is always a skill. Defaults to `"doc"`.
   */
  atKind?: "doc" | "user";
}

/** Caps embedded media so markdown screenshots/videos don't dominate the pane. */
const MARKDOWN_MEDIA_CLASS = "max-h-80 w-auto max-w-full object-contain";

/**
 * Extends the shared renderer's plugins: authors type single newlines
 * expecting a line break, not markdown's paragraph-continuation behaviour, and
 * `@`/`/` tokens become chips.
 */
const REMARK_PLUGINS = [remarkBreaks, remarkMentionChips];

/** Stop parent click-to-edit handlers when interacting with media. */
function stopParentClick(e: MouseEvent) {
  e.stopPropagation();
}

/** Flatten a markdown link's React children back to its plain label text. */
function childrenToText(children: ReactNode): string {
  let out = "";
  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      out += String(child);
    }
  });
  return out;
}

/**
 * Resolves an `@` token that could be either a Data mention or a People
 * mention — the case in every human-authored body (comments and chat messages),
 * where the picker offers both. Uses `mentions.getEntity` — the same lookup Data
 * chips already use for hover/navigate — as the single source of truth for what
 * an opaque mention id points to, rather than guessing from the id's shape.
 */
export function AtMentionChip({
  id,
  label,
  repoId,
  onNavigateToData,
}: {
  id: string;
  label: string;
  repoId: Id<"githubRepos">;
  onNavigateToData: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const entity = useQuery(api.mentions.getEntity, { id, repoId });

  if (entity === undefined) {
    // Kind not resolved yet — render a neutral, non-interactive placeholder
    // rather than guessing (a click during this window must not misfire).
    return <span className={MENTION_CHIP_CLASS}>@{label}</span>;
  }
  if (entity === null) {
    return <UserMentionChip userId={id} label={label} />;
  }
  return (
    <DataMentionChip
      entityId={id}
      repoId={repoId}
      label={label}
      onClick={onNavigateToData}
    />
  );
}

/**
 * Renders Markdown content while turning `@[Label](id)` / `/[Label](id)` mention
 * tokens into the same data/user/skill chips used elsewhere. Markdown formatting
 * (bold, lists, code, etc.) and inline mentions both work.
 */
export function MarkdownMentionText({
  text,
  repoBasePath,
  repoId,
  className,
  atKind = "doc",
}: MarkdownMentionTextProps) {
  const navigate = useNavigate();
  const navigateToData = useDataMentionNavigate(repoBasePath, repoId);

  return (
    <Markdown
      className={className}
      remarkPlugins={REMARK_PLUGINS}
      components={{
        // Replace Streamdown's inline-block image wrapper (download-only hover)
        // with the shared click-to-fullscreen preview used elsewhere.
        img: ({ src, alt }) => {
          if (typeof src !== "string" || src.length === 0) return null;
          const label =
            typeof alt === "string" && alt.length > 0 ? alt : "Image";
          return (
            <span
              className="my-4 flex justify-center overflow-hidden"
              onClick={stopParentClick}
            >
              <ScreenshotPreview
                url={src}
                alt={label}
                className={MARKDOWN_MEDIA_CLASS}
              />
            </span>
          );
        },
        video: ({ src }) => {
          if (typeof src !== "string" || src.length === 0) return null;
          return (
            <span
              className="my-4 flex justify-center overflow-hidden"
              onClick={stopParentClick}
            >
              <VideoPreview url={src} className={MARKDOWN_MEDIA_CLASS} />
            </span>
          );
        },
        a: ({ href, children }) => {
          const match =
            typeof href === "string" ? href.match(MENTION_HREF_REGEX) : null;

          if (!match) {
            if (typeof href === "string" && isChipLinkUrl(href)) {
              return <LinkChip url={href} />;
            }
            return <MarkdownLink href={href}>{children}</MarkdownLink>;
          }

          const prefix = match[1];
          const id = match[2];
          const label = childrenToText(children);

          // `/` → skill
          if (prefix === "slash") {
            const navigateToSkills = (e: MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              navigate({ to: `${repoBasePath}/settings/skills` });
            };
            if (isHarnessSkillTokenId(id)) {
              return <span className={SKILL_CHIP_CLASS}>/{label}</span>;
            }
            if (isSkillTokenId(id)) {
              return (
                <SkillMentionChip
                  skillId={id}
                  label={label}
                  onClick={navigateToSkills}
                />
              );
            }
            return (
              <button
                type="button"
                onClick={navigateToSkills}
                className={`${SKILL_CHIP_CLASS} cursor-pointer transition-[background-color] hover:bg-primary/20`}
              >
                /{label}
              </button>
            );
          }

          // `@` → data mention, or (comments only) a mix of data + user mentions
          const onNavigateToData = (e: MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            e.stopPropagation();
            void navigateToData(id);
          };

          if (atKind === "user") {
            return (
              <AtMentionChip
                id={id}
                label={label}
                repoId={repoId}
                onNavigateToData={onNavigateToData}
              />
            );
          }

          return (
            <DataMentionChip
              entityId={id}
              repoId={repoId}
              label={label}
              onClick={onNavigateToData}
            />
          );
        },
      }}
    >
      {text}
    </Markdown>
  );
}
