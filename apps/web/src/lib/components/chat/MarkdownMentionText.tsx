"use client";

import type { MouseEvent, ReactNode } from "react";
import { Children } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Markdown,
  ScreenshotPreview,
  VideoPreview,
} from "@vvedantb/ui";
import remarkBreaks from "remark-breaks";
import {
  DataMentionChip,
  SkillMentionChip,
  UserMentionChip,
  isSkillTokenId,
  isHarnessSkillTokenId,
  MENTION_CHIP_CLASS,
  SKILL_CHIP_CLASS,
} from "@/lib/components/mentions";
import { useDataMentionNavigate } from "@/lib/useDataMentionNavigate";
import { EVA_MENTION_ID, parseMentionChipHref } from "@eva/shared";
import { remarkMentionChips } from "./remarkMentionChips";
import { ChatMarkdownLink } from "./ChatMarkdownLink";

interface MarkdownMentionTextProps {
  text: string;
  repoBasePath: string;
  repoId: Id<"githubRepos">;
  className?: string;
  atKind?: "doc" | "user";
}

const MARKDOWN_MEDIA_CLASS = "max-h-80 w-auto max-w-full object-contain";

const REMARK_PLUGINS = [remarkBreaks, remarkMentionChips];
const PLAIN_REMARK_PLUGINS = [remarkBreaks];

/**
 * Markdown with no repo to resolve mentions against (Manager Ave). Its composer
 * offers no mentions or skills, so there are no tokens to turn into chips.
 */
export function PlainMarkdownText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <Markdown className={className} remarkPlugins={PLAIN_REMARK_PLUGINS}>
      {text}
    </Markdown>
  );
}

function stopParentClick(e: MouseEvent) {
  e.stopPropagation();
}

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
  const isEva = id === EVA_MENTION_ID;
  const entity = useQuery(
    api.mentions.getEntity,
    isEva ? "skip" : { id, repoId },
  );

  if (isEva || entity === undefined) {
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
      mode="static"
      className={className}
      remarkPlugins={REMARK_PLUGINS}
      components={{
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
            typeof href === "string" ? parseMentionChipHref(href) : null;

          if (!match) {
            return <ChatMarkdownLink href={href}>{children}</ChatMarkdownLink>;
          }

          const prefix = match.kind;
          const id = match.id;
          const label = childrenToText(children);

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
