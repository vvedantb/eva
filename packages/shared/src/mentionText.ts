/**
 * Stored chat text holds mentions as `@[Label](id)` and skills as
 * `/[Label](id)` (a Convex id, or a synthetic skill id below). The web and
 * phone composers show `@Label` / `/Label` while the user types and build
 * these tokens on send, so a message from either notifies and renders the same.
 */

/** The token id charset (Convex ids), so plain markdown links never match. */
export const CONVEX_ID_PATTERN = /^[a-z0-9_]{16,40}$/;
/** Mirrors the backend regex in `_mentions/mentionToken.ts`. */
export const MENTION_TOKEN_REGEX = /@\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g;
export const SKILL_TOKEN_REGEX = /\/\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g;

export function formatMentionToken(label: string, id: string): string {
  return `@[${label}](${id})`;
}

export function formatSkillToken(title: string, id: string): string {
  return `/[${title}](${id})`;
}

/** `@[Label](id)` → `@Label`. */
export function mentionTokensToEditableText(content: string): string {
  return content.replace(/@\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g, (_match, label: string) => `@${label}`);
}

/** `@[Label](id)` → `@Label` and `/[Label](id)` → `/Label`. */
export function tokenizedToDisplayText(content: string): string {
  return mentionTokensToEditableText(content).replace(
    /\/\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g,
    (_match, label: string) => `/${label}`,
  );
}

/** Label → id for the `@` chips and the `/` chips of one draft. */
export interface MentionTokenMaps {
  mentionMap: ReadonlyMap<string, string>;
  skillMap: ReadonlyMap<string, string>;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches `@<label>` for each known label. Sorted longest-first so longer
 * labels win when one is a prefix of another.
 */
export function buildMentionPattern(labels: string[]): RegExp {
  const sorted = [...labels].sort((a, b) => b.length - a.length);
  return new RegExp(`@(?:${sorted.map(escapeRegExp).join("|")})`, "g");
}

/** Matches `/<label>` for each known skill label. */
export function buildSkillPattern(labels: string[]): RegExp {
  const sorted = [...labels].sort((a, b) => b.length - a.length);
  return new RegExp(`\\/(?:${sorted.map(escapeRegExp).join("|")})`, "g");
}

/**
 * Display text → wire text: each `@Label` / `/Label` the maps know becomes its
 * token. What the web editor's `tokenize` and the phone composer send.
 */
export function tokenizeMentionText(text: string, { mentionMap, skillMap }: MentionTokenMaps): string {
  let result = text;
  if (mentionMap.size > 0) {
    result = result.replace(buildMentionPattern([...mentionMap.keys()]), (match) => {
      const id = mentionMap.get(match.slice(1));
      return id ? formatMentionToken(match.slice(1), id) : match;
    });
  }
  if (skillMap.size > 0) {
    result = result.replace(buildSkillPattern([...skillMap.keys()]), (match) => {
      const id = skillMap.get(match.slice(1));
      return id ? formatSkillToken(match.slice(1), id) : match;
    });
  }
  return result;
}

/**
 * Stored tokenized text → the display text and the label → id maps an editor
 * needs to send the same tokens again (drafts, stash restore).
 */
export function tokenizedToEditable(content: string): {
  displayText: string;
  mentionMap: Map<string, string>;
  skillMap: Map<string, string>;
} {
  const mentionMap = new Map<string, string>();
  const skillMap = new Map<string, string>();
  // Fresh regexes: the module-level `/g` ones carry `lastIndex` state.
  for (const [, label, id] of content.matchAll(/@\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g)) {
    if (label !== undefined && id !== undefined) mentionMap.set(label, id);
  }
  for (const [, label, id] of content.matchAll(/\/\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g)) {
    if (label !== undefined && id !== undefined) skillMap.set(label, id);
  }
  return { displayText: tokenizedToDisplayText(content), mentionMap, skillMap };
}

/**
 * Eva system skills have no `repoSkills` row, so their chips carry a synthetic
 * id instead. The prefix keeps them inside the token charset (and past the
 * 16-char minimum) while staying distinguishable from a real Convex id.
 */
const SYSTEM_SKILL_TOKEN_PREFIX = "evasystemskill_";

export function systemSkillTokenId(name: string): string {
  return `${SYSTEM_SKILL_TOKEN_PREFIX}${name.replace(/-/g, "_")}`;
}

export function isSystemSkillTokenId(id: string): boolean {
  return id.startsWith(SYSTEM_SKILL_TOKEN_PREFIX);
}

/**
 * Harness built-in skills also have no Convex row; same synthetic-id scheme as
 * system skills, distinct prefix. Both prefixes are 16 chars, so the longest
 * built-in name still fits the 40-char id cap.
 */
const HARNESS_SKILL_TOKEN_PREFIX = "evabuiltinskill_";

export function harnessSkillTokenId(name: string): string {
  return `${HARNESS_SKILL_TOKEN_PREFIX}${name.replace(/-/g, "_")}`;
}

export function isHarnessSkillTokenId(id: string): boolean {
  return id.startsWith(HARNESS_SKILL_TOKEN_PREFIX);
}
