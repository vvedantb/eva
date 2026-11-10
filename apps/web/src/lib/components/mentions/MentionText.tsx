import { Fragment, type ReactNode } from "react";
import { MarkdownLink } from "@vvedantb/ui";
import { MENTION_CHIP_CLASS, SKILL_CHIP_CLASS } from "./mentionChipStyles";
import { MENTION_TOKEN_REGEX, SKILL_TOKEN_REGEX } from "@eva/shared";
import { LINK_URL_SOURCE } from "./linkUrls";

interface MentionMatch {
  label: string;
  id: string;
}

interface SkillMatch {
  label: string;
  id: string;
}

interface MentionTextProps {
  text: string;
  className?: string;
  /**
   * Root element. Defaults to a block `<p>`. Use `"span"` when the text must be
   * inline single-line content — e.g. inside MarqueeOnHover, whose overflow
   * measurement and ellipsis only work with inline children, not a block box.
   */
  as?: "p" | "span";
  renderMention?: (match: MentionMatch, key: number) => ReactNode;
  renderSkill?: (match: SkillMatch, key: number) => ReactNode;
  renderLink?: (url: string, key: number) => ReactNode;
}

interface PlainSegment {
  kind: "text";
  value: string;
}

interface MentionSegmentMatch {
  kind: "mention";
  match: MentionMatch;
}

interface SkillSegmentMatch {
  kind: "skill";
  match: SkillMatch;
}

interface LinkSegmentMatch {
  kind: "link";
  url: string;
}

type Segment =
  | PlainSegment
  | MentionSegmentMatch
  | SkillSegmentMatch
  | LinkSegmentMatch;

function parseSegments(text: string): Segment[] {
  const combined = new RegExp(
    `${MENTION_TOKEN_REGEX.source}|${SKILL_TOKEN_REGEX.source}|${LINK_URL_SOURCE}`,
    "g",
  );

  const segments: Segment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(combined)) {
    const start = match.index;
    if (start === undefined) continue;
    if (start > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, start) });
    }

    const token = match[0];
    if (/^https?:\/\//.test(token)) {
      segments.push({ kind: "link", url: token });
    } else if (token.startsWith("@")) {
      segments.push({
        kind: "mention",
        match: { label: match[1], id: match[2] },
      });
    } else {
      segments.push({
        kind: "skill",
        match: { label: match[3], id: match[4] },
      });
    }

    cursor = start + token.length;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", value: text.slice(cursor) });
  }

  return segments;
}

const defaultRenderMention = (match: MentionMatch, key: number): ReactNode => (
  <span key={key} className={MENTION_CHIP_CLASS}>
    @{match.label}
  </span>
);

const defaultRenderSkill = (match: SkillMatch, key: number): ReactNode => (
  <span key={key} className={SKILL_CHIP_CLASS}>
    /{match.label}
  </span>
);

const defaultRenderLink = (url: string, key: number): ReactNode => (
  <MarkdownLink key={key} href={url}>
    {url}
  </MarkdownLink>
);

export function MentionText({
  text,
  className,
  as: Tag = "p",
  renderMention = defaultRenderMention,
  renderSkill = defaultRenderSkill,
  renderLink = defaultRenderLink,
}: MentionTextProps) {
  const segments = parseSegments(text);

  return (
    <Tag
      className={
        className ??
        "text-sm text-foreground whitespace-pre-wrap wrap-break-word"
      }
    >
      {segments.map((segment, i) => {
        if (segment.kind === "text") {
          return <Fragment key={i}>{segment.value}</Fragment>;
        }
        if (segment.kind === "mention") {
          return renderMention(segment.match, i);
        }
        if (segment.kind === "skill") {
          return renderSkill(segment.match, i);
        }
        return renderLink(segment.url, i);
      })}
    </Tag>
  );
}
