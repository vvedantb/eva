import { Activity, type ReactNode } from "react";
import type { Id, SandboxOwner } from "@eva/backend";
import { sandboxAutoWakeEligible } from "@eva/shared";
import { ProjectSandboxPanel } from "@/lib/components/projects/ProjectSandboxPanel";
import { ProjectSandboxChatPanel } from "@/lib/components/projects/ProjectSandboxChatPanel";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { SandboxSurfaceProviders } from "@/lib/components/sandbox/SandboxSurfaceProviders";
import { ProjectTasksPanel } from "@/lib/components/projects/ProjectTasksPanel";
import { ProjectChatTabs } from "@/lib/components/projects/ProjectChatTabs";
import { ProjectTaskChat } from "@/lib/components/projects/ProjectTaskChat";
import type { ProjectSandboxTab } from "@/lib/components/projects/projectSandboxTabs";
import type {
  ProjectTaskTabRows,
  ProjectTaskTabs,
} from "@/lib/components/projects/useProjectTaskTabs";
import { entityPathSegment } from "@/lib/numId";
import {
  SandboxWorkspace,
  type TerminalPanelApi,
} from "@/lib/components/sandbox/SandboxWorkspace";
import type { SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import type {
  ProjectDetailProject,
  ProjectSandboxState,
} from "./projectDetailHelpers";

interface SandboxPanelContext {
  rightPanelCollapsed: boolean;
  onToggleRightPanel: () => void;
}

interface ProjectDetailSandboxContentProps {
  projectId: Id<"projects">;
  projectNumId?: number;
  project: ProjectDetailProject;
  repoId: Id<"githubRepos">;
  basePath: string;
  sandboxTab: ProjectSandboxTab;
  sandbox: ProjectSandboxState;
  chatTurnOpen: boolean | undefined;
  sandboxRailWidthPx: number;
  expandRightSignal: number;
  /** Opens a reply thread in the rail's Replies tab (and expands the rail). */
  onThreadOpen: (messageId: string) => void;
  /** ✕ on the Replies tab: back to the tab before it. */
  onCloseThread: () => void;
  /** The chat tabs: Eva, then the open tasks (`useProjectTaskTabs`). */
  taskTabs: ProjectTaskTabs;
  /** The open task tabs' rows (`useProjectTaskTabRows`). */
  taskTabRows: ProjectTaskTabRows;
  openFile: (path: string) => void;
  openDiffs: (repoRelativePath?: string) => void;
  openAgentsTab: () => void;
}

export function ProjectDetailSandboxContent({
  projectId,
  projectNumId,
  project,
  repoId,
  basePath,
  sandboxTab,
  sandbox,
  chatTurnOpen,
  sandboxRailWidthPx,
  expandRightSignal,
  onThreadOpen,
  onCloseThread,
  taskTabs,
  taskTabRows,
  openFile,
  openDiffs,
  openAgentsTab,
}: ProjectDetailSandboxContentProps) {
  // The coordinator can always wake: a project has no closed state.
  const {
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    sandboxStartupActivity,
    sandboxId: projectSandboxId,
    handleStartSandbox,
    handleSandboxToggle,
  } = sandbox;
  // An archived project opens read-only: no wake, no composer.
  const isArchived = project.archivedAt !== undefined;
  const projectPathSegment = entityPathSegment({ numId: projectNumId });
  const { rows, selectedRow, selectedLoading } = taskTabRows;
  // Eva's tab is selected unless a task tab is (or its row still loads).
  const onEva = selectedRow === undefined && !selectedLoading;

  // Always mount the sandbox panel so tabs stay reachable while stopped —
  // same as sessions. Panes self-gate.
  const projectSandboxPanel = (
    panes: SandboxPanesApi,
    owner: SandboxOwner,
    terminalPanel: TerminalPanelApi,
    collapsed: boolean,
    onToggle: () => void,
  ) => (
    <ProjectSandboxPanel
      projectId={projectId}
      projectSession={sandbox.projectSession}
      projectNumId={projectNumId}
      title={project.title}
      sandboxId={projectSandboxId}
      isActive={isSandboxActive}
      repoId={repoId}
      prUrl={project.prUrl}
      devPort={sandbox.sandbox.devPort}
      devCommand={sandbox.sandbox.devCommand}
      owner={owner}
      panes={panes}
      terminalPanel={terminalPanel}
      sandboxTab={sandboxTab}
      onStartSandbox={
        isSandboxStopping || isArchived ? undefined : handleStartSandbox
      }
      isSandboxStarting={isSandboxStarting}
      autoWakeEligible={sandboxAutoWakeEligible({
        status: sandbox.sandbox.status,
        sandboxId: projectSandboxId,
        sandboxError: sandbox.sandbox.sandboxError,
        canStart: !isArchived,
        isBusy: chatTurnOpen,
      })}
      isArchived={isArchived}
      collapsed={collapsed}
      onToggle={onToggle}
      onCloseThread={onCloseThread}
      selectedTask={selectedRow}
      selectedTaskLoading={selectedLoading}
      openTaskIds={new Set(rows.map(({ row }) => row._id))}
      onOpenTask={taskTabs.open}
      onAskEva={taskTabs.askEva}
    />
  );

  // Chat tabs need the panel (a task tab shows its tabs there): a project
  // with no session yet has only Eva's chat, and no tab row. The row sits in
  // the shown chat's header, left of its usage chip, so tabs and chip share
  // one line.
  const chatTabs = sandbox.sandbox.owner ? (
    <ProjectChatTabs
      rows={rows}
      selected={onEva ? null : taskTabs.selected}
      evaRunning={chatTurnOpen === true}
      isArchived={isArchived}
      onSelect={taskTabs.select}
      onClose={taskTabs.close}
      onAskEva={taskTabs.askEva}
    />
  ) : undefined;

  const evaChat = (
    <ProjectSandboxChatPanel
      headerLeft={chatTabs}
      projectId={projectId}
      projectSession={sandbox.projectSession}
      isSandboxActive={isSandboxActive}
      isSandboxToggling={isSandboxStarting || isSandboxStopping}
      isSandboxStopping={isSandboxStopping}
      sandboxStartupActivity={sandboxStartupActivity}
      onOpenFile={openFile}
      onViewDiff={openDiffs}
      onOpenAgentsTab={openAgentsTab}
      projectTaskCards={{
        projectId,
        repoId,
        onOpenTask: taskTabs.open,
      }}
      onThreadOpen={onThreadOpen}
      isArchived={isArchived}
      onSandboxToggle={handleSandboxToggle}
    />
  );

  // Every chat stays mounted behind its tab (Eva's and each open task's, at
  // most `MAX_PROJECT_TASK_TABS`): switching tabs is instant and keeps each
  // composer's draft. A hidden `<Activity>` unmounts effects, so a hidden
  // chat marks nothing read and listens to no keys.
  const chatColumn = () =>
    sandbox.sandbox.owner ? (
      <div className="flex h-full min-h-0 flex-col">
        {/* A task tab whose row still loads shows no chat yet: keep the tabs. */}
        {!onEva && selectedRow === undefined ? chatTabs : null}
        <Activity mode={onEva ? "visible" : "hidden"}>
          <div className="flex min-h-0 flex-1 flex-col">{evaChat}</div>
        </Activity>
        {projectPathSegment
          ? rows.map(({ numId, row }) => (
              <Activity
                key={row._id}
                mode={row._id === selectedRow?._id ? "visible" : "hidden"}
              >
                <div className="flex min-h-0 flex-1 flex-col">
                  <ProjectTaskChat
                    taskId={row._id}
                    prUrl={row.prUrl}
                    fullPageHref={`${basePath}/projects/${projectPathSegment}/${numId}`}
                    onShowReview={() => taskTabs.showTab("task-review")}
                    headerLeft={chatTabs}
                  />
                </div>
              </Activity>
            ))
          : null}
      </div>
    ) : (
      evaChat
    );

  const layout = (rightPanel: (ctx: SandboxPanelContext) => ReactNode) => (
    <ResizablePanelLayout
      // Remount per project: the open flag is read once at mount.
      key={projectId}
      storageKey="project-sandbox-panel"
      chatPane="left"
      collapsedStorageKey={`project-sandbox-panel:${projectId}`}
      leftDefaultSize="40%"
      leftMinWidthPx={350}
      rightMinWidthPx={300}
      rightCollapsedSizePx={sandboxRailWidthPx}
      seamlessSeparator
      defaultRightCollapsed={false}
      expandRightSignal={expandRightSignal}
      mobilePaneLabels={{ left: "Chat", right: "Sandbox" }}
      leftPanel={chatColumn}
      rightPanel={rightPanel}
    />
  );

  const { owner } = sandbox.sandbox;
  return (
    <SandboxSurfaceProviders
      onOpenFile={openFile}
      onOpenDiffsTab={() => openDiffs()}
    >
      {owner ? (
        <SandboxWorkspace
          owner={owner}
          storageScope={`project:${projectId}`}
          sandboxId={projectSandboxId}
          isActive={isSandboxActive}
          terminalPanes={sandbox.sandbox.terminalPanes}
        >
          {(panes, workspaceOwner, terminalPanel) =>
            layout(({ rightPanelCollapsed, onToggleRightPanel }) =>
              projectSandboxPanel(
                panes,
                workspaceOwner,
                terminalPanel,
                rightPanelCollapsed,
                onToggleRightPanel,
              ),
            )
          }
        </SandboxWorkspace>
      ) : (
        // No session yet, so no sandbox tabs: the card holds only the Tasks
        // list. "+" focuses Eva's composer, the only chat there.
        layout(() => (
          <div className="flex h-full min-h-0 flex-col">
            <ProjectTasksPanel
              projectId={projectId}
              projectNumId={projectNumId}
              repoId={repoId}
              basePath={basePath}
              onAskEva={taskTabs.askEva}
            />
          </div>
        ))
      )}
    </SandboxSurfaceProviders>
  );
}
