"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Spinner } from "@eva/ui";
import { MentionContentPreview } from "./MentionContentPreview";

interface SkillMentionHoverCardBodyProps {
  skillId: Id<"repoSkills">;
}

export function SkillMentionHoverCardBody({
  skillId,
}: SkillMentionHoverCardBodyProps) {
  const skill = useQuery(api.repoSkills.getContentById, { skillId });

  if (skill === undefined) {
    return (
      <MentionContentPreview title="Loading…">
        <Spinner className="size-4" />
      </MentionContentPreview>
    );
  }

  if (skill === null) {
    return (
      <MentionContentPreview title="Skill not found">
        <p>No stored contents yet. Sync skills from GitHub in Settings.</p>
      </MentionContentPreview>
    );
  }

  return (
    <MentionContentPreview title={skill.title}>
      <pre className="whitespace-pre-wrap wrap-break-word font-mono text-2xs leading-relaxed text-foreground">
        {skill.content}
      </pre>
    </MentionContentPreview>
  );
}
