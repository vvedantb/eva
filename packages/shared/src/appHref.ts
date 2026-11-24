// What a web app link inside a repo points at, so the phone can open its own
// screen for it (notification links, pushes). Links are
// `/<owner>/<name>[/<app>]/<section>/<number>…`, as `repoBasePath` and
// `entityHref` build them, or a root project link (`repoScopedProjectPath`);
// a query or `#comment-…` anchor is ignored.

import { repoBasePath, repoScopedProjectPath, type RepoPathFields } from "./repoPath";

export type AppLinkTarget =
  | { kind: "task"; numId: number }
  | { kind: "project"; numId: number }
  | { kind: "session"; numId: number }
  | { kind: "doc"; numId: number }
  | { kind: "review"; prNumber: number };

const SECTIONS: Record<string, AppLinkTarget["kind"]> = {
  "quick-tasks": "task",
  projects: "project",
  sessions: "session",
  docs: "doc",
  reviews: "review",
};

const isNumber = (segment: string | undefined): segment is string => segment !== undefined && /^\d+$/.test(segment);

/**
 * The phone-openable item a repo link names, or null (a section list, drafts,
 * automations, settings: the web only). A project task's link,
 * `…/projects/<project>/<task>`, names the task.
 */
export function parseAppHref(href: string): AppLinkTarget | null {
  const path = repoScopedProjectPath(href.split(/[?#]/)[0] ?? "");
  // Past `/<owner>/<name>`: the app folder, when there is one, is not a section followed by a number.
  const segments = path.split("/").filter(Boolean).slice(2);
  for (let index = 0; index < segments.length; index += 1) {
    const kind = SECTIONS[segments[index] ?? ""];
    const first = segments[index + 1];
    if (!kind || !isNumber(first)) continue;
    const second = segments[index + 2];
    if (kind === "project" && isNumber(second)) return { kind: "task", numId: Number(second) };
    if (kind === "review") return { kind, prNumber: Number(first) };
    return { kind, numId: Number(first) };
  }
  return null;
}

/**
 * The repo a web link sits in: the one whose base path (`repoBasePath`) the
 * link starts with, the longest when an app folder and its repo both match.
 * Undefined for a link outside every repo (Home, Inbox, a team).
 */
export function repoForHref<R extends RepoPathFields>(repos: readonly R[], href: string): R | undefined {
  const path = repoScopedProjectPath(href.split(/[?#]/)[0] ?? "");
  let best: R | undefined;
  let bestLength = -1;
  for (const repo of repos) {
    const base = repoBasePath(repo);
    const inside = path === base || path.startsWith(`${base}/`);
    if (inside && base.length > bestLength) {
      best = repo;
      bestLength = base.length;
    }
  }
  return best;
}
