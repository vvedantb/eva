/** Top-level global routes, keyed by their first path segment. */
const GLOBAL_LABELS: Record<string, string> = {
  home: "Home",
  teams: "Teams",
  artifacts: "Artifacts",
  inbox: "Inbox",
  sessions: "Sessions",
  settings: "Settings",
  setup: "Setup",
  testing: "Testing",
};

/** Sections under `/{owner}/{repo}`, keyed by their third path segment. */
const REPO_SECTION_LABELS: Record<string, string> = {
  automations: "Automations",
  docs: "Docs",
  drafts: "Drafts",
  inbox: "Inbox",
  projects: "Projects",
  "quick-tasks": "Quick tasks",
  reviews: "Reviews",
  sessions: "Sessions",
  settings: "Settings",
  stats: "Stats",
  "testing-arena": "Testing arena",
};

/**
 * Turns a teammate's `lastSeenPath` into a readable location, e.g.
 * `/acme/web/sessions/12` → "acme/web · Sessions". Returns null when there is
 * no path to describe, so callers can fall back to "Online".
 *
 * Deliberately segment-based rather than route-matched: presence stores a bare
 * pathname, and a label only needs the first three segments.
 */
export function describeLocation(pathname?: string): string | null {
  if (!pathname) return null;
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const first = segments[0];
  if (first === undefined) return "Home";

  const global = GLOBAL_LABELS[first];
  if (global !== undefined) return global;

  // Repo routes are `/{owner}/{repo}[/section/...]` or
  // `/{owner}/{repo}/{app}/[section/...]`. Strip a `repo--app` suffix, or a
  // slash app segment when the next piece is a known section.
  const second = segments[1];
  if (second === undefined) return first;

  const repoLabel = `${first}/${second.replace(/--.*$/, "")}`;
  let sectionKey = segments[2];
  if (
    sectionKey !== undefined &&
    REPO_SECTION_LABELS[sectionKey] === undefined &&
    segments[3] !== undefined &&
    REPO_SECTION_LABELS[segments[3]] !== undefined
  ) {
    // /owner/repo/app/section — app is not part of the label noise we strip
    // from `--`, but we still want the section name.
    sectionKey = segments[3];
  }
  const section =
    sectionKey === undefined ? undefined : REPO_SECTION_LABELS[sectionKey];
  return section === undefined ? repoLabel : `${repoLabel} · ${section}`;
}
