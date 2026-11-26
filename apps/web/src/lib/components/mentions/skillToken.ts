import type { Id } from "@eva/backend";
import {
  CONVEX_ID_PATTERN,
  isHarnessSkillTokenId,
  isSystemSkillTokenId,
} from "@eva/shared";

export function isSkillTokenId(id: string): id is Id<"repoSkills"> {
  return (
    CONVEX_ID_PATTERN.test(id) &&
    !isSystemSkillTokenId(id) &&
    !isHarnessSkillTokenId(id)
  );
}
