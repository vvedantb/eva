/**
 * Token format for inline mentions: `@[Label](id)`.
 * Mirrors the backend regex in `_mentions/mentionToken.ts`. Restricting the
 * id capture to the Convex Id charset avoids false positives with regular
 * markdown links.
 */
export const CONVEX_ID_PATTERN = /^[a-z0-9_]{16,40}$/;
export const MENTION_TOKEN_REGEX = /@\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g;

export function formatMentionToken(label: string, id: string): string {
  return `@[${label}](${id})`;
}

/** Converts stored `@[Label](id)` tokens back to `@Label` for the mention editor. */
export function mentionTokensToEditableText(content: string): string {
  return content.replace(
    MENTION_TOKEN_REGEX,
    (_match, label: string) => `@${label}`,
  );
}

/**
 * Scans tokenized content and builds label→id maps for both mention and skill
 * tokens. Use this to reconstruct the editor's internal maps from persisted
 * token strings so chips render correctly on load.
 *
 * Capture groups: mention — [1]=label, [2]=id; skill — [1]=label, [2]=id.
 */
function extractMapsFromTokenizedText(content: string): {
  mentionMap: Map<string, string>;
  skillMap: Map<string, string>;
} {
  const mentionMap = new Map<string, string>();
  const skillMap = new Map<string, string>();

  // Use string.matchAll with new RegExp instances to avoid lastIndex drift
  // across multiple calls (the module-level /g regexes carry state).
  const mentionPattern = /@\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g;
  for (const match of content.matchAll(mentionPattern)) {
    const label = match[1];
    const id = match[2];
    if (label !== undefined && id !== undefined) {
      mentionMap.set(label, id);
    }
  }

  const skillPattern = /\/\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g;
  for (const match of content.matchAll(skillPattern)) {
    const label = match[1];
    const id = match[2];
    if (label !== undefined && id !== undefined) {
      skillMap.set(label, id);
    }
  }

  return { mentionMap, skillMap };
}

/**
 * Converts stored tokenized content into plain editable display text:
 * `@[Label](id)` → `@Label` and `/[Label](id)` → `/Label`.
 *
 * The skill-token regex is inlined here (rather than imported from
 * skillToken.ts) to avoid a circular import.
 */
export function tokenizedToDisplayText(content: string): string {
  const withMentions = mentionTokensToEditableText(content);
  return withMentions.replace(
    /\/\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g,
    (_match, label: string) => `/${label}`,
  );
}

/**
 * Converts a stored tokenized string into editable display text and the two
 * maps the MentionEditor needs for chip rendering. Pass the returned maps as
 * `initialMentionMap`/`initialSkillMap` and the `displayText` as `value`.
 */
export function tokenizedToEditable(content: string): {
  displayText: string;
  mentionMap: Map<string, string>;
  skillMap: Map<string, string>;
} {
  const displayText = tokenizedToDisplayText(content);
  const { mentionMap, skillMap } = extractMapsFromTokenizedText(content);
  return { displayText, mentionMap, skillMap };
}
