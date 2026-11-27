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

  const resolvedAppName = appName ?? repo?.rootDirectory?.split("/").pop();
  const basePath = resolvedAppName
    ? `/${owner}/${name}/${resolvedAppName}`
    : `/${owner}/${name}`;

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
