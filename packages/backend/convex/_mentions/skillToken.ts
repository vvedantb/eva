/**
 * Token format for inline skill references: `/[Title](skillId)`.
 */
export const SKILL_TOKEN_REGEX = /\/\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g;

export function stripSkillTokens(message: string): string {
  return message.replace(SKILL_TOKEN_REGEX, (_full, title) => `/${title}`);
}
