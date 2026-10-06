import type { MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  MentionText,
  SkillMentionChip,
  isSkillTokenId,
  isHarnessSkillTokenId,
  SKILL_CHIP_CLASS,
} from "@/lib/components/mentions";
import { AtMentionChip } from "@/lib/components/chat/MarkdownMentionText";
import { useDataMentionNavigate } from "@/lib/useDataMentionNavigate";
import type { ChatRepo } from "@/lib/components/chat/chatBodyUtils";

interface MessageMentionTextProps {
  text: string;
  /** Absent (Manager Ave): tokens render as inert chips. */
  repo?: ChatRepo;
  className?: string;
  /** Root element — `"span"` for inline single-line contexts (see MentionText). */
  as?: "p" | "span";
}

export function MessageMentionText({
  text,
  repo,
  className,
  as,
}: MessageMentionTextProps) {
  const navigate = useNavigate();
  const navigateToData = useDataMentionNavigate(repo?.basePath ?? "", repo?.id);

  if (!repo) return <MentionText text={text} className={className} as={as} />;

  return (
    <MentionText
      text={text}
      className={className}
      as={as}
      renderMention={(match, key) => {
        const onClick = (e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          void navigateToData(match.id);
        };
        // This renders the author's own draft/queued text, so a token may name
        // either a teammate or a data entity — AtMentionChip resolves which.
        return (
          <AtMentionChip
            key={key}
            id={match.id}
            label={match.label}
            repoId={repo.id}
            onNavigateToData={onClick}
          />
        );
      }}
      renderSkill={(match, key) => {
        const navigateToSkills = (e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          navigate({ to: `${repo.basePath}/settings/skills` });
        };
        if (isHarnessSkillTokenId(match.id)) {
          return (
            <span key={key} className={SKILL_CHIP_CLASS}>
              /{match.label}
            </span>
          );
        }
        if (isSkillTokenId(match.id)) {
          return (
            <SkillMentionChip
              key={key}
              skillId={match.id}
              label={match.label}
              onClick={navigateToSkills}
            />
          );
        }
        return (
          <button
            key={key}
            type="button"
            onClick={navigateToSkills}
            className={`${SKILL_CHIP_CLASS} cursor-pointer transition-[background-color] hover:bg-primary/20`}
          >
            /{match.label}
          </button>
        );
      }}
    />
  );
}
