import type { ChatEntityKind } from "@eva/backend";

type RepoPathFields = { owner: string; name: string; rootDirectory?: string };

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

/**
 * Web path of one session, quick task or project, keyed by its per-repo numId.
 * Without a numId (still awaiting backfill) it is the kind's section list.
 */
export function entityHref(
  kind: ChatEntityKind,
  repo: RepoPathFields,
  numId: number | undefined,
): string {
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
 * Reads `/owner/name[/app]/<section>/<numId>[/…]`, as a path or as a full URL
 * on `appOrigin` (links to another Eva deployment are not this app's data).
 * Null for every other link.
 */
export function parseEvaEntityLink(
  href: string,
  appOrigin: string,
): EvaEntityLink | null {
  let pathname: string;
  if (href.startsWith("/") && !href.startsWith("//")) {
    pathname = href.split(/[?#]/)[0] ?? "";
  } else if (URL.canParse(href) && new URL(href).origin === appOrigin) {
    pathname = new URL(href).pathname;
  } else {
    return null;
  }
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
