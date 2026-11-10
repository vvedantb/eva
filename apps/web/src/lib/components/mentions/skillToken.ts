import type { Id } from "@eva/backend";
import {
  CONVEX_ID_PATTERN,
  isHarnessSkillTokenId,
  isSystemSkillTokenId,
} from "@eva/shared";

export function isSkillTokenId(id: string): id is Id<"repoSkills"> {
  // Must exclude system/harness-skill ids: they are not Convex ids, and
  // querying repoSkills.getContentById with one throws server-side.
  return (
    CONVEX_ID_PATTERN.test(id) &&
    !isSystemSkillTokenId(id) &&
    !isHarnessSkillTokenId(id)
  );
}
