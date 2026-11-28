"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RepoProvider, RepoGate, useRepo } from "@/lib/contexts/RepoContext";
import { EntityNumIdGate } from "@/lib/components/EntityNumIdGate";
import { useSessionByNumId } from "@/lib/useResolveByNumId";
import { SessionDetailClient } from "../SessionDetailClient";
import { useSessionRouteSandboxTab } from "../_utils/useSessionRouteSandboxTab";
import { workspaceRootPath } from "@eva/shared";
import { HiddenSandboxTabRedirect } from "@/lib/components/sandbox/HiddenSandboxTabRedirect";
import {
  useIsHiddenSandboxTab,
  useSimpleView,
} from "@/lib/hooks/useSimpleView";

interface CachedSessionShellProps {
  numId: string;
  owner: string;
  repoParam: string;
  isActiveRoute: boolean;
}

/**
 * One kept-alive session detail tree. While `isActiveRoute` is false the shell
 * keeps its DOM and state (parent uses a hidden `<Activity>`, so its effects
 * are torn down) and freezes its sandbox tab and chat
 * tab so the active session's URL does not rewrite sibling caches. Each shell
 * carries its own passive RepoProvider so shells from other apps stay
 * resolvable.
 */
export function CachedSessionShell({
  numId,
  owner,
  repoParam,
  isActiveRoute,
}: CachedSessionShellProps) {
  return (
    <RepoProvider owner={owner} repoParam={repoParam} passive>
      <RepoGate>
        <CachedSessionShellInner
          numId={numId}
          owner={owner}
          repoParam={repoParam}
          isActiveRoute={isActiveRoute}
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
}: CachedSessionShellProps) {
  const navigate = useNavigate();
  const { basePath, repoId } = useRepo();
  const simpleView = useSimpleView();
  const isHiddenTab = useIsHiddenSandboxTab();
  const session = useSessionByNumId(numId, repoId);
  const urlSandboxTab = useSessionRouteSandboxTab();
  const deferredActive = useDeferredValue(isActiveRoute);
  const isTreeActive = isActiveRoute || deferredActive;
  const [sandboxTab, setSandboxTab] = useState(urlSandboxTab);

  /* eslint-disable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change --
     Cached shells stay mounted while hidden: only the one on the live route may
     follow the URL, so this cannot just mirror the prop during render. */
  useEffect(() => {
    if (!isActiveRoute) return;
    setSandboxTab(urlSandboxTab);
  }, [isActiveRoute, urlSandboxTab]);
  /* eslint-enable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change */

  const sessionParams = { owner, repo: repoParam, numId };

  const openFile = (path: string) => {
    if (isHiddenTab("files")) return;
    const filesRoot = workspaceRootPath(path) ?? undefined;
    void navigate({
      to: "/$owner/$repo/sessions/$numId/$sandboxTab",
      params: { ...sessionParams, sandboxTab: "files" },
      search: (prev) => ({ ...prev, file: path, filesRoot }),
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
      {isActiveRoute ? (
        <HiddenSandboxTabRedirect
          activeTab={sandboxTab}
          to="/$owner/$repo/sessions/$numId/$sandboxTab"
          params={{ owner, repo: repoParam, numId }}
        />
      ) : null}
      <EntityNumIdGate
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
            isRouteActive={isTreeActive}
          />
        )}
      </EntityNumIdGate>
    </>
  );
}
