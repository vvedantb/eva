"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RepoProvider, RepoGate, useRepo } from "@/lib/contexts/RepoContext";
import { EntityNumIdGate } from "@/lib/components/EntityNumIdGate";
import { useSessionByNumId } from "@/lib/useResolveByNumId";
import { SessionDetailClient } from "../SessionDetailClient";
import { useSessionRouteSandboxTab } from "../_utils/useSessionRouteSandboxTab";
import { workspaceRootPath } from "@/lib/components/chat/ChangedFilesCard";
import { SimpleViewSandboxRedirect } from "@/lib/components/sandbox/SimpleViewSandboxRedirect";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

interface CachedSessionShellProps {
  numId: string;
  /**
   * Repo identity captured when the shell was cached — NOT the live URL.
   * The sessions layout survives `$owner/$repo` changes, so a hidden shell
   * must keep resolving against its own repo, not the one now in the URL.
   */
  owner: string;
  repoParam: string;
  /** True when this shell matches the URL `$numId` (visible). */
  isActiveRoute: boolean;
  /**
   * Mounted inside Manager Ave's popover, which already titles the surface.
   * Hides the session-chat title so "Manager Ave" is not painted twice.
   */
  embedded?: boolean;
}

/**
 * One kept-alive session detail tree. While `isActiveRoute` is false the shell
 * stays mounted (parent uses `hidden`) and freezes its sandbox tab so the
 * active session's URL does not rewrite sibling caches. Each shell carries its
 * own passive RepoProvider so shells from other apps stay resolvable.
 */
export function CachedSessionShell({
  numId,
  owner,
  repoParam,
  isActiveRoute,
  embedded = false,
}: CachedSessionShellProps) {
  return (
    <RepoProvider owner={owner} repoParam={repoParam} passive>
      <RepoGate>
        <CachedSessionShellInner
          numId={numId}
          owner={owner}
          repoParam={repoParam}
          isActiveRoute={isActiveRoute}
          embedded={embedded}
        />
      </RepoGate>
    </RepoProvider>
  );
}

function CachedSessionShellInner({
  numId,
  owner,
  repoParam,
  isActiveRoute,
  embedded = false,
}: CachedSessionShellProps) {
  const navigate = useNavigate();
  const { basePath, repoId } = useRepo();
  const simpleView = useSimpleView();
  const session = useSessionByNumId(numId, repoId);
  const urlSandboxTab = useSessionRouteSandboxTab();
  const [sandboxTab, setSandboxTab] = useState(urlSandboxTab);

  useEffect(() => {
    if (!isActiveRoute) return;
    setSandboxTab(urlSandboxTab);
  }, [isActiveRoute, urlSandboxTab]);

  // Typed routes + the cached `repoParam` (`repo--app`), not slash-form
  // `basePath`. `navigate({ to })` matches the route tree before the
  // history rewrite, so `/owner/repo/app/sessions/…` is a miss on
  // monorepo apps and the Review tab never opens.
  const sessionParams = { owner, repo: repoParam, numId };

  const openFile = (path: string) => {
    if (simpleView) return;
    // A file the agent touched in a linked checkout has to select that repo's
    // root, or the Files tree would list the primary beside another repo's
    // file. `undefined` drops a stale root when a primary file is opened.
    const filesRoot = workspaceRootPath(path) ?? undefined;
    void navigate({
<<<<<<< HEAD
      to: `${basePath}/sessions/${numId}/files`,
      search: (prev) => ({ ...prev, file: path, filesRoot }),
=======
      to: "/$owner/$repo/sessions/$numId/$sandboxTab",
      params: { ...sessionParams, sandboxTab: "files" },
      search: (prev) => ({ ...prev, file: path }),
>>>>>>> origin/main
    });
  };

  const openDiffs = (repoRelativePath?: string) => {
    if (simpleView) return;
    void navigate({
      to: "/$owner/$repo/sessions/$numId/review/diffs/$diffView",
      params: { ...sessionParams, diffView: "unified" },
      search: (prev) => ({
        ...prev,
        ...(repoRelativePath ? { diffFile: repoRelativePath } : {}),
      }),
    });
  };

  const onSandboxTabChange = (next: string) => {
    if (next === "review") {
      void navigate({
        to: "/$owner/$repo/sessions/$numId/review/diffs/$diffView",
        params: { ...sessionParams, diffView: "unified" },
        search: true,
      });
      return;
    }
    void navigate({
      to: "/$owner/$repo/sessions/$numId/$sandboxTab",
      params: { ...sessionParams, sandboxTab: next },
      search: true,
    });
  };

  return (
    <>
      {/* Only the visible shell may redirect — a hidden shell firing Navigate
          would hijack the active session's URL. */}
      {isActiveRoute ? (
        <SimpleViewSandboxRedirect
          activeTab={sandboxTab}
          to="/$owner/$repo/sessions/$numId/$sandboxTab"
          params={{ owner, repo: repoParam, numId }}
        />
      ) : null}
      <EntityNumIdGate
        // Same rule as the redirect above: only the visible shell may navigate,
        // so a hidden shell holding a legacy Convex id just keeps its spinner.
        resolve={isActiveRoute ? session : { ...session, redirectTo: null }}
        entityLabel="session"
        backTo={`${basePath}/sessions`}
      >
        {(sessionDoc) => (
          <SessionDetailClient
            sessionId={sessionDoc._id}
            activeSandboxTab={sandboxTab}
            onSandboxTabChange={onSandboxTabChange}
            onOpenFile={openFile}
            onViewDiff={simpleView ? undefined : openDiffs}
            isRouteActive={isActiveRoute}
            hideTitle={embedded}
          />
        )}
      </EntityNumIdGate>
    </>
  );
}
