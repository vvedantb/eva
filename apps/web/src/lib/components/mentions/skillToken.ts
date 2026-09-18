import type { Id } from "@eva/backend";
import { CONVEX_ID_PATTERN } from "./mentionToken";

/**
 * Token format for inline skill references: `/[Title](skillId)`.
 */
export const SKILL_TOKEN_REGEX = /\/\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g;

/**
 * Eva system skills have no `repoSkills` row, so their chips carry a synthetic
 * id instead. The prefix keeps them inside the token charset (and past the
 * 16-char minimum) while staying distinguishable from a real Convex id.
 */
const SYSTEM_SKILL_TOKEN_PREFIX = "evasystemskill_";

export function systemSkillTokenId(name: string): string {
  return `${SYSTEM_SKILL_TOKEN_PREFIX}${name.replace(/-/g, "_")}`;
}

function isSystemSkillTokenId(id: string): boolean {
  return id.startsWith(SYSTEM_SKILL_TOKEN_PREFIX);
}

/**
 * Harness built-in skills (see `harnessSkills.ts`) also have no Convex row;
 * same synthetic-id scheme as system skills, distinct prefix. Both prefixes
 * are 16 chars, so the longest built-in name still fits the 40-char id cap.
 */
const HARNESS_SKILL_TOKEN_PREFIX = "evabuiltinskill_";

export function harnessSkillTokenId(name: string): string {
  return `${HARNESS_SKILL_TOKEN_PREFIX}${name.replace(/-/g, "_")}`;
}

export function isHarnessSkillTokenId(id: string): boolean {
  return id.startsWith(HARNESS_SKILL_TOKEN_PREFIX);
}

export function isSkillTokenId(id: string): id is Id<"repoSkills"> {
  // Must exclude system/harness-skill ids: they are not Convex ids, and
  // querying repoSkills.getContentById with one throws server-side.
  return (
    CONVEX_ID_PATTERN.test(id) &&
    !isSystemSkillTokenId(id) &&
    !isHarnessSkillTokenId(id)
  );
}

export function formatSkillToken(title: string, id: string): string {
  return `/[${title}](${id})`;
}
