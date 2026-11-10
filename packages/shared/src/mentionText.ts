/**
 * Stored chat text holds mentions as `@[Label](id)` and skills as
 * `/[Label](id)` (the id is a Convex id). These turn them back into the
 * `@Label` / `/Label` a person reads, for the web editor and the phone.
 */

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
