/**
 * Token format for inline document mentions: `@[Title](docId)`.
 * Title is captured up to 200 chars (excluding `]`); docId is constrained to
 * the Convex Id charset to avoid false positives with regular markdown links.
 */
export const MENTION_TOKEN_REGEX = /@\[([^\]]{1,200})\]\(([a-z0-9_]{16,40})\)/g;
