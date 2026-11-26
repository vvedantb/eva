/** Builtin sandbox tab URL segments (`/sessions/$numId/$sandboxTab`). */
export const SANDBOX_TABS = [
  "preview",
  "browser",
  "editor",
  "computer",
  "review",
  "files",
  "agents",
  "prd",
  "designs",
  "artifacts",
  "documents",
] as const;
export type SandboxTab = (typeof SANDBOX_TABS)[number];

/**
 * Old URL segments the web app still redirects: `terminal` (bottom panel),
 * `desktop` (→ `computer`), `diffs` and `pr` (→ `review`).
 */
const LEGACY_SANDBOX_TAB_SLUGS = ["terminal", "desktop", "diffs", "pr"];

/** Builtin sandbox URL segments that custom tab slugs must not collide with. */
export const RESERVED_APP_TAB_SLUGS: ReadonlySet<string> = new Set([
  ...SANDBOX_TABS,
  ...LEGACY_SANDBOX_TAB_SLUGS,
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
