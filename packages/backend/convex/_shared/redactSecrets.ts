/**
 * Strips common credential shapes from logs that may reach chat or Convex
 * stdout. Keep in sync with `callback-src/runtime/completion.ts`.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/gh[spou]_[A-Za-z0-9_]+/g, "***")
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "***")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "***")
    .replace(/(?<=Bearer\s+)[A-Za-z0-9._-]+/gi, "***")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+\b/g, "***")
    .replace(/x-access-token:[^@\s]+@/gi, "x-access-token:***@")
    .replace(/\/\/([^/\s:@]+):([^@\s]+)@/g, "//$1:***@");
}
