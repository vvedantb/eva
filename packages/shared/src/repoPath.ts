import type { ChatEntityKind } from "@eva/backend";

export type RepoPathFields = { owner: string; name: string; rootDirectory?: string };

/** Web path prefix for a githubRepos row (a monorepo app adds its folder name: `/owner/name/app`). */
export function repoBasePath(repo: RepoPathFields): string {
  if (!repo.rootDirectory) return `/${repo.owner}/${repo.name}`;
  const appName = repo.rootDirectory.split("/").pop();
  if (!appName) return `/${repo.owner}/${repo.name}`;
  return `/${repo.owner}/${repo.name}/${appName}`;
}

/** Repo section that lists each chat kind: `/owner/name/<section>/<numId>`. */
export const ENTITY_SECTION = {
  session: "sessions",
  task: "quick-tasks",
  project: "projects",
} as const satisfies Record<ChatEntityKind, string>;

/** Root of the cross-repo Projects pages (the overview). */
export const PROJECTS_PATH = "/projects";

/** The `?repo=` filter value for a repo on the Projects overview: `owner/name[/app]`. */
export function projectsRepoFilterKey(repo: RepoPathFields): string {
  return repoBasePath(repo).slice(1);
}

/**
 * Projects live at the root, not in a repo: `/projects/owner/name[/app]/<numId>`.
 * `repoBase` is the repo's web base path (`repoBasePath`, or the web's `basePath`).
 */
export function projectHref(repoBase: string, numId: number | string): string {
  return `${PROJECTS_PATH}${repoBase}/${numId}`;
}

/** A project URL segment: its numId, or a Convex id in links older than numIds. */
const isProjectIdSegment = (segment: string): boolean =>
  /^\d+$/.test(segment) || /^[a-z0-9]{31,}$/.test(segment);

/**
 * Splits `/projects/owner/name[/app]/<project>/…` into the repo segments
 * (`owner`, `name`, and the app folder when there is one) and the rest from
 * the project on. Null for every other path.
 */
export function splitProjectPath(
  path: string,
): { repo: string[]; rest: string[] } | null {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] !== PROJECTS_PATH.slice(1) || segments.length < 4) return null;
  const hasApp = segments.length >= 5 && !isProjectIdSegment(segments[3] ?? "");
  const repoEnd = hasApp ? 4 : 3;
  return { repo: segments.slice(1, repoEnd), rest: segments.slice(repoEnd) };
}

/**
 * A project URL in the repo-scoped shape the link parsers read:
 * `/projects/owner/name[/app]/<numId>/…` → `/owner/name[/app]/projects/<numId>/…`.
 * Every other path comes back unchanged.
 */
export function repoScopedProjectPath(path: string): string {
  const split = splitProjectPath(path);
  if (split === null) return path;
  return `/${split.repo.join("/")}/${ENTITY_SECTION.project}/${split.rest.join("/")}`;
}

/**
 * Web path of one session, quick task or project, keyed by its per-repo numId.
 * Without a numId (still awaiting backfill) it is the kind's list.
 */
export function entityHref(
  kind: ChatEntityKind,
  repo: RepoPathFields,
  numId: number | undefined,
): string {
  if (kind === "project") {
    return numId === undefined ? PROJECTS_PATH : projectHref(repoBasePath(repo), numId);
  }
  const section = `${repoBasePath(repo)}/${ENTITY_SECTION[kind]}`;
  return numId === undefined ? section : `${section}/${numId}`;
}

/** Repo sections whose `<numId>` pages have a hover card in chat. */
const LINKABLE_SECTIONS = ["sessions", "quick-tasks", "projects", "docs"] as const;
export type EvaLinkSection = (typeof LINKABLE_SECTIONS)[number];

function linkableSection(segment: string | undefined): EvaLinkSection | null {
  return LINKABLE_SECTIONS.find((section) => section === segment) ?? null;
}

/** An in-app link to one session, quick task, project or doc. */
export interface EvaEntityLink {
  owner: string;
  name: string;
  appName?: string;
  section: EvaLinkSection;
  numId: number;
}

/**
 * Reads `/owner/name[/app]/<section>/<numId>[/…]` (or a root project URL,
 * `repoScopedProjectPath`), as a path or as a full URL
 * on `appOrigin` (links to another Eva deployment are not this app's data).
 * Null for every other link.
 */
export function parseEvaEntityLink(
  href: string,
  appOrigin: string,
): EvaEntityLink | null {
  let rawPath: string;
  if (href.startsWith("/") && !href.startsWith("//")) {
    rawPath = href.split(/[?#]/)[0] ?? "";
  } else if (URL.canParse(href) && new URL(href).origin === appOrigin) {
    rawPath = new URL(href).pathname;
  } else {
    return null;
  }
  const pathname = repoScopedProjectPath(rawPath);
  const [owner, name, third, fourth, fifth] = pathname.split("/").slice(1);
  if (!owner || !name) return null;
  const direct = linkableSection(third);
  const nested = direct === null ? linkableSection(fourth) : null;
  const section = direct ?? nested;
  const numText = direct !== null ? fourth : fifth;
  if (section === null || !numText || !/^\d+$/.test(numText)) return null;
  return {
    owner,
    name,
    ...(nested !== null && third ? { appName: third } : {}),
    section,
    numId: Number(numText),
  };
}
