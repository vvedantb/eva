/** Builtin sandbox URL segments that custom tab slugs must not collide with. */
export const RESERVED_APP_TAB_SLUGS = new Set([
  "preview",
  "browser",
  "editor",
  "terminal",
  "computer",
  // Legacy Computer-tab URL segment — keep reserved so custom tabs can't collide.
  "desktop",
  // Legacy Diffs-tab URL segment — redirect to `review`.
  "diffs",
  // Legacy Review-tab URL segment — redirect to `review`.
  "pr",
  "review",
  "files",
  "prd",
  "designs",
  "agents",
  "artifacts",
]);

/**
 * Turns a custom tab display name into a URL segment (e.g. "Supabase Studio" →
 * "supabase-studio"). Empty string means the name has no usable characters.
 */
export function slugifyAppTabName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
