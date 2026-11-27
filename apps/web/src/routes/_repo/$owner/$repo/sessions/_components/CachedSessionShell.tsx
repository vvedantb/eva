"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { chatParser } from "@/lib/search-params";
import { RepoProvider, RepoGate, useRepo } from "@/lib/contexts/RepoContext";
import { EntityNumIdGate } from "@/lib/components/EntityNumIdGate";
import { useSessionByNumId } from "@/lib/useResolveByNumId";
import { SessionDetailClient } from "../SessionDetailClient";
import { useSessionRouteSandboxTab } from "../_utils/useSessionRouteSandboxTab";
import { workspaceRootPath } from "@eva/shared";
import { SimpleViewSandboxRedirect } from "@/lib/components/sandbox/SimpleViewSandboxRedirect";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

interface CachedSessionShellProps {
  numId: string;
  owner: string;
  repoParam: string;
  isActiveRoute: boolean;
}

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

  const [urlChat] = useQueryState("chat", chatParser);
  const [chatNumber, setChatNumber] = useState(urlChat);
  if (isActiveRoute && chatNumber !== urlChat) {
    setChatNumber(urlChat);
  }
  const onChatChange = (number: number | null) => {
    void navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        chat: number === null || number === 1 ? undefined : number,
      }),
    });
  };

  const sessionParams = { owner, repo: repoParam, numId };

  const openFile = (path: string) => {
    if (simpleView) return;
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
        resolve={isActiveRoute ? session : { ...session, redirectTo: null }}
        entityLabel="session"
        backTo={`${basePath}/sessions`}
      >
        {(sessionDoc) => (
          <SessionDetailClient
            sessionId={sessionDoc._id}
            chatNumber={chatNumber}
            onChatChange={onChatChange}
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
