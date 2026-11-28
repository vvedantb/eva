function shellSingleQuoteEscape(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

/**
 * Formats env vars as `KEY='value'` lines, one per entry, safe to `source` in
 * bash. Returns an empty string when there are no vars — callers should skip
 * writing the file entirely in that case rather than write an empty one.
 */
export function formatEnvFile(vars: Record<string, string>): string {
  const keys = Object.keys(vars);
  if (keys.length === 0) return "";
  return (
    keys
      .map((key) => `${key}='${shellSingleQuoteEscape(vars[key] ?? "")}'`)
      .join("\n") + "\n"
  );
}
