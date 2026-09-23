"use client";

import { createContext, useContext, useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { api } from "@eva/backend";
import { decodeRepoParam, toInternalRepoHref } from "@/lib/utils/repoUrl";
import type { FunctionReturnType } from "convex/server";
import { Skeleton } from "@eva/ui";
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

function resolveLoadState(
  repo: Repo | null | undefined,
  context: Pick<RepoContextType, "basePath" | "owner" | "name">,
  passive: boolean,
): RepoLoadState {
  if (repo === undefined) return PENDING;
  // Passive trees are cached and hidden: they must render nothing the user
  // could act on, so a background repo can never explain itself over the top of
  // the session they are actually looking at.
  if (repo === null) {
    return passive
      ? PENDING
      : { status: "not-found", owner: context.owner, name: context.name };
  }
  return {
    status: "ready",
    value: {
      ...context,
      repo,
      repoId: repo._id,
      installationId: repo.installationId,
      rootDirectory: repo.rootDirectory,
    },
  };
}

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
  const location = useLocation();

  const repo = useQuery(api.githubRepos.getByOwnerAndName, {
    owner,
    name,
    appName,
  });

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
    if (!location.pathname.startsWith(barePrefix)) return;
    const after = location.pathname.slice(barePrefix.length);
    if (after !== "" && !after.startsWith("/")) return;
    if (barePrefix === canonicalPrefix) return;

    navigate({
      to: toInternalRepoHref(`${canonicalPrefix}${after}`),
      search: (prev) => prev,
      replace: true,
    });
  }, [repo, appName, owner, name, location.pathname, navigate, passive]);

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

  const loadState = resolveLoadState(
    repo,
    { basePath, owner, name },
    passive,
  );

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
    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 p-3"
        aria-busy="true"
        aria-label="Loading codebase"
      >
        <Skeleton className="h-8 w-48" />
        <Skeleton className="min-h-0 flex-1" />
      </div>
    );
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
