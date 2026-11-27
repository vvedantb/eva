"use client";

import { createContext, useContext, useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { api } from "@eva/backend";
import { decodeRepoParam, toInternalRepoHref } from "@/lib/utils/repoUrl";
import type { FunctionReturnType } from "convex/server";
import { CenteredSpinner } from "@vvedantb/ui";
import { RepoNotFound } from "@/lib/components/RepoNotFound";

type Repo = NonNullable<
  FunctionReturnType<typeof api.githubRepos.getByOwnerAndName>
>;

interface RepoContextType {
  repo: Repo;
  repoId: Repo["_id"];
  basePath: string;
  owner: string;
  name: string;
  installationId: number;
  rootDirectory: string | undefined;
}

const RepoContext = createContext<RepoContextType | undefined>(undefined);

/**
 * Internal load state for the repo query, as an explicit union: "not found" and
 * "still loading" used to both arrive as `undefined`, which is what made the
 * gate unable to tell them apart (and why a missing repo silently redirected
 * instead of saying so). Letting RepoProvider always render its children keeps
 * the sidebar/chrome above it mounted across navigation, while RepoGate scopes
 * the placeholder to the routed content that actually needs `repo`.
 */
type RepoLoadState =
  | { status: "pending" }
  | { status: "not-found"; owner: string; name: string }
  | { status: "ready"; value: RepoContextType };

const PENDING: RepoLoadState = { status: "pending" };

const RepoLoadStateContext = createContext<RepoLoadState>(PENDING);

interface RepoProviderProps {
  children: React.ReactNode;
  owner: string;
  repoParam: string;
  /**
   * Cached/hidden trees (session shell cache): skips URL canonicalization and
   * the not-found screen so a background repo can never hijack navigation or
   * speak over the visible one.
   */
  passive?: boolean;
}

export function RepoProvider({
  children,
  owner,
  repoParam,
  passive = false,
}: RepoProviderProps) {
  const { name, appName } = decodeRepoParam(repoParam);

  const navigate = useNavigate();
  // Only the canonicalisation effect needs the path. Passive (cached, hidden)
  // trees select a constant so a navigation elsewhere does not re-render them.
  const pathname = useRouterState({
    select: (s) => (passive ? "" : s.location.pathname),
  });

  const repo = useQuery(api.githubRepos.getByOwnerAndName, {
    owner,
    name,
    appName,
  });

  /* eslint-disable no-effect/no-event-handler --
     Canonicalises the URL the user landed on (bookmark, shared link, back
     button) once the repo row arrives from Convex — no click involved. */
  // Bare /owner/repo URLs for monorepos without a visible root row resolve to an
  // app repo — canonicalize to the public slash form (router rewrite maps it
  // to the internal `--` segment for matching).
  useEffect(() => {
    if (passive) return;
    if (!repo?.rootDirectory || appName) return;
    const appSegment = repo.rootDirectory.split("/").pop();
    if (!appSegment) return;

    const barePrefix = `/${owner}/${name}`;
    const canonicalPrefix = `/${owner}/${name}/${appSegment}`;
    if (!pathname.startsWith(barePrefix)) return;
    const after = pathname.slice(barePrefix.length);
    if (after !== "" && !after.startsWith("/")) return;
    if (barePrefix === canonicalPrefix) return;

    navigate({
      to: toInternalRepoHref(`${canonicalPrefix}${after}`),
      search: (prev) => prev,
      replace: true,
    });
  }, [repo, appName, owner, name, pathname, navigate, passive]);
  /* eslint-enable no-effect/no-event-handler */

  /**
   * Public path prefix for the active repo. Monorepo apps use slash form
   * (`/owner/repo/app`) so `<a href>` and the address bar never show `repo--app`.
   * Pass through {@link toInternalRepoHref} before `navigate({ to })` / `<Link to>`
   * so the router still matches the single-segment `$repo` param.
   */
  const resolvedAppName = appName ?? repo?.rootDirectory?.split("/").pop();
  const basePath = resolvedAppName
    ? `/${owner}/${name}/${resolvedAppName}`
    : `/${owner}/${name}`;

  // Built inline, not in a helper: the compiler memoises object literals but
  // not the result of an arbitrary call, and a fresh value here re-renders
  // every `useRepo()` consumer below (whole session trees) on each navigation.
  // Passive trees are cached and hidden: they must render nothing the user
  // could act on, so a missing repo stays "pending" there instead of
  // explaining itself over the session the user is actually looking at.
  const loadState: RepoLoadState =
    repo === undefined
      ? PENDING
      : repo === null
        ? passive
          ? PENDING
          : { status: "not-found", owner, name }
        : {
            status: "ready",
            value: {
              basePath,
              owner,
              name,
              repo,
              repoId: repo._id,
              installationId: repo.installationId,
              rootDirectory: repo.rootDirectory,
            },
          };

  return (
    <RepoLoadStateContext.Provider value={loadState}>
      {children}
    </RepoLoadStateContext.Provider>
  );
}

/**
 * Scopes the repo-loading placeholder to routed content, then provides
 * RepoContext to `children`. Chrome mounted above RepoProvider (sidebar, etc.)
 * is unaffected.
 */
export function RepoGate({ children }: { children: React.ReactNode }) {
  const loadState = useContext(RepoLoadStateContext);

  if (loadState.status === "not-found") {
    return <RepoNotFound owner={loadState.owner} name={loadState.name} />;
  }

  // A centred spinner said "something is happening" and nothing else; the
  // page's own shape is a better answer to "what am I waiting for", and it
  // does not re-centre as the real content lands.
  if (loadState.status === "pending") {
    return <CenteredSpinner label="Loading codebase" />;
  }

  return (
    <RepoContext.Provider value={loadState.value}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </RepoContext.Provider>
  );
}

export function useRepo() {
  const context = useContext(RepoContext);
  if (context === undefined) {
    throw new Error("useRepo must be used within a RepoProvider");
  }
  return context;
}
