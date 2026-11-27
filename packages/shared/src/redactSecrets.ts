const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/gh[spour]_[A-Za-z0-9_]+/g, "***"],
  [/\bgithub_pat_[A-Za-z0-9_]+/g, "***"],
  [/\bsk-[A-Za-z0-9_-]{10,}\b/g, "***"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "***"],
  [/(?<=\bBearer\s+)[A-Za-z0-9._~+/=-]{20,}/gi, "***"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+/g, "***"],
  [/\/\/([^/\s:@]+):[^@\s/]+@/g, "//$1:***@"],
];

/** Replaces known token shapes in `text` with `***`. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
