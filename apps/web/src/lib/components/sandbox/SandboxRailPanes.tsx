"use client";

import type { ReactNode } from "react";
import { SessionArtifactsPanel } from "@/lib/components/artifacts/SessionArtifactsPanel";
import {
  SessionDocumentsPanel,
  type ProjectDocumentsContext,
} from "@/lib/components/docs/SessionDocumentsPanel";
import type { ChatSourceArg } from "./chatSource";
import type { ChatEntityRef } from "@/lib/components/chat/sandboxChatSurface";
import {
  useIsHiddenSandboxTab,
  useSimpleView,
} from "@/lib/hooks/useSimpleView";
import { KeepAlivePane } from "./KeepAlivePane";
import { SandboxAgentsPanel } from "./SandboxAgentsPanel";
import type { SubagentView } from "./agentActivity";

const STACK_PANE = "flex h-full min-h-0 flex-col overflow-hidden";

/**
 * The Artifacts, Documents, Files and Agents tabs every sandbox rail shares.
 * Each mounts on first visit and then hides in `<Activity>` (`KeepAlivePane`).
 */
export function SandboxRailPanes({
  activeTab,
  artifactSource,
  projectDocuments,
  files,
  agents,
}: {
  activeTab: string;
  /** Whose artifacts and documents the tabs list. */
  artifactSource: ChatSourceArg;
  /** A project's own documents, listed with its session's. */
  projectDocuments?: ProjectDocumentsContext;
  /** The Files tab body; omitted where the rail has no Files tab. */
  files?: ReactNode;
  agents: {
    entity: ChatEntityRef | undefined;
    list: SubagentView[];
    /** Read-only owner: no per-agent stop. */
    isReadOnly: boolean;
  };
}) {
  const simpleView = useSimpleView();
  const isHiddenTab = useIsHiddenSandboxTab();
  return (
    <>
      <KeepAlivePane active={activeTab === "artifacts"} className={STACK_PANE}>
        <SessionArtifactsPanel source={artifactSource} />
      </KeepAlivePane>
      <KeepAlivePane active={activeTab === "documents"} className={STACK_PANE}>
        <SessionDocumentsPanel
          source={artifactSource}
          project={projectDocuments}
        />
      </KeepAlivePane>
      {files ? (
        <KeepAlivePane
          active={!isHiddenTab("files") && activeTab === "files"}
          className="h-full min-h-0"
        >
          {files}
        </KeepAlivePane>
      ) : null}
      <KeepAlivePane
        active={!simpleView && activeTab === "agents"}
        className="h-full min-h-0"
      >
        <SandboxAgentsPanel
          entity={agents.entity}
          agents={agents.list}
          isReadOnly={agents.isReadOnly}
        />
      </KeepAlivePane>
    </>
  );
}
