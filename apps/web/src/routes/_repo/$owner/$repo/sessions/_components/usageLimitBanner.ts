/**
 * The reset hint the harness puts in a usage-limit failure, e.g. the
 * `resets 12pm (UTC)` tail of "Error: You've hit your session limit ·
 * resets 12pm (UTC)". Kept as text rather than parsed into a timestamp: the
 * banner only has to repeat what the provider said, and the wording varies
 * ("session limit", "out of extra usage", weekly windows).
 */
export function usageLimitResetText(content: string): string | undefined {
  const match = /resets\s+.+?(?:\(UTC\)|UTC)/i.exec(content);
  if (match === null) return undefined;
  const text = match[0].trim();
  return text.length > 0 ? text : undefined;
}
