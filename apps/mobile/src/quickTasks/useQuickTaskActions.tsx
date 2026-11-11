import { api, type Id } from "@eva/backend";
import { TASK_STATUSES, TASK_STATUS_LABELS, repoBasePath, type DisplayTaskStatus } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconArrowMoveRight,
  IconClipboard,
  IconFolder,
  IconLink,
  IconPlayerPlay,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react-native";
import { ConfirmDialog, SheetRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Text, type TextStyle } from "react-native";
import { WEB_URL } from "@/config";
import { MenuDivider, MenuSheet, SubmenuRow } from "@/quickTasks/MenuSheet";
import { userLabel } from "@/quickTasks/QuickTaskListOptions";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import { useScheme } from "@/ui/theme";

type QuickTask = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];
type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];
type Project = FunctionReturnType<typeof api.projects.list>[number];
type Page = "root" | "status" | "reviewer" | "project" | "move";

/** A task's web page: its number under the repo's Quick Tasks, as the web card's `href`. */
function taskWebPath(repo: Repo, task: QuickTask): string {
  const list = `${repoBasePath(repo)}/quick-tasks`;
  return task.numId === undefined ? list : `${list}/${task.numId}`;
}

/**
 * The web quick-task card menu (`TaskCardMenuItems`) on the phone: a long
 * press opens it as a bottom sheet (`openSheet`), with a page per web
 * submenu. Run Eva (outside projects; a first run from To Do, or In
 * Progress), Status, Code Reviewer, Project and Move to codebase, then Copy
 * title, Copy task link and Delete. Move and Delete ask first, with the web
 * dialogs; the rest act at once. Writes are the web mutations. Render
 * `dialogs` once. Not here from the web menu: Open in new tab, the PR
 * submenus and Model.
 */
export function useQuickTaskActions({
  repo,
  users,
  projects,
}: {
  repo: Repo;
  users: User[] | undefined;
  projects: Project[] | undefined;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const [target, setTarget] = useState<QuickTask | null>(null);
  const [page, setPage] = useState<Page>("root");
  const [deleteTarget, setDeleteTarget] = useState<QuickTask | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ task: QuickTask; repoId: Id<"githubRepos">; name: string } | null>(null);
  const currentUserId = useQuery(api.auth.me, {});
  const codebases = useQuery(api.githubRepos.listGroupedByCodebase, {});
  // The runs decide whether Run Eva is on; only the open menu's task needs them, as on the web.
  const runs = useQuery(api.agentRuns.listByTask, target ? { taskId: target._id } : "skip");
  const updateStatus = useMutation(api.agentTasks.updateStatus);
  const updateTask = useMutation(api.agentTasks.update);
  const startExecution = useMutation(api.agentTasks.startExecution);
  const deleteTask = useMutation(api.agentTasks.deleteCascade);

  const close = () => {
    setTarget(null);
    setPage("root");
  };
  const act = (run: () => Promise<unknown>, failure: string) => {
    close();
    run().catch(() => toast.error(failure));
  };

  // Web: every other app, each codebase's apps by name (`codebase/app` in a monorepo).
  const moveTargets = (codebases ?? []).flatMap((codebase) =>
    codebase.apps
      .filter((app) => app._id !== repo._id)
      .map((app) => ({
        repoId: app._id,
        name: codebase.isMonorepo ? `${codebase.displayName}/${app.appName}` : codebase.displayName,
      })),
  );
  const reviewers = (users ?? []).filter((user) => user.role === "dev");

  const body = (task: QuickTask) => {
    // Web `showRunButton`: To Do only offers a first run.
    const canRun = (task.status === "todo" && runs !== undefined && runs.length === 0) || task.status === "in_progress";
    switch (page) {
      case "root":
        return (
          <>
            {task.projectId === undefined ? (
              <SheetRow
                icon={IconPlayerPlay}
                title="Run Eva"
                disabled={!canRun}
                onPress={() => act(() => startExecution({ id: task._id }), "Couldn't start task")}
              />
            ) : null}
            {task.projectId === undefined ? <MenuDivider /> : null}
            {task.status !== "draft" ? (
              <SubmenuRow icon={statusAppearance(task.status, scheme).icon} title="Status" onPress={() => setPage("status")} />
            ) : null}
            <SubmenuRow icon={IconUserPlus} title="Code Reviewer" onPress={() => setPage("reviewer")} />
            <SubmenuRow icon={IconFolder} title="Project" onPress={() => setPage("project")} />
            {moveTargets.length > 0 ? (
              <SubmenuRow icon={IconArrowMoveRight} title="Move to codebase" onPress={() => setPage("move")} />
            ) : null}
            <MenuDivider />
            <SheetRow
              icon={IconClipboard}
              title="Copy title"
              onPress={() => {
                close();
                void Clipboard.setStringAsync(task.title);
              }}
            />
            <SheetRow
              icon={IconLink}
              title="Copy task link"
              onPress={() => {
                close();
                void Clipboard.setStringAsync(`${WEB_URL}${taskWebPath(repo, task)}`);
              }}
            />
            <MenuDivider />
            <SheetRow
              icon={IconTrash}
              title="Delete"
              danger
              onPress={() => {
                close();
                setDeleteTarget(task);
              }}
            />
          </>
        );
      case "status":
        return TASK_STATUSES.map((status: DisplayTaskStatus) => {
          const { icon: Icon, text } = statusAppearance(status, scheme);
          return (
            <SheetRow
              key={status}
              leading={<Icon size={20} color={text} />}
              title={TASK_STATUS_LABELS[status]}
              active={task.status === status}
              onPress={() => act(() => updateStatus({ id: task._id, status }), "Couldn't change the status")}
            />
          );
        });
      case "reviewer":
        return (
          <>
            {currentUserId ? (
              <SheetRow
                title="Assign to me"
                active={task.assignedTo === currentUserId}
                onPress={() => act(() => updateTask({ id: task._id, assignedTo: currentUserId }), "Couldn't assign task")}
              />
            ) : null}
            <MenuDivider />
            <SheetRow
              title="Unassigned"
              active={task.assignedTo === undefined}
              onPress={() => act(() => updateTask({ id: task._id, assignedTo: null }), "Couldn't assign task")}
            />
            {reviewers.map((user) => (
              <SheetRow
                key={user._id}
                title={userLabel(user) ?? "Unknown"}
                active={task.assignedTo === user._id}
                onPress={() => act(() => updateTask({ id: task._id, assignedTo: user._id }), "Couldn't assign task")}
              />
            ))}
          </>
        );
      case "project":
        return (
          <>
            <SheetRow
              title="No project"
              active={task.projectId === undefined}
              onPress={() => act(() => updateTask({ id: task._id, projectId: null }), "Couldn't change the project")}
            />
            {(projects ?? []).map((project) => (
              <SheetRow
                key={project._id}
                icon={IconFolder}
                title={project.title}
                active={task.projectId === project._id}
                onPress={() => act(() => updateTask({ id: task._id, projectId: project._id }), "Couldn't change the project")}
              />
            ))}
          </>
        );
      case "move":
        return moveTargets.map((app) => (
          <SheetRow
            key={app.repoId}
            title={app.name}
            onPress={() => {
              close();
              setMoveTarget({ task, ...app });
            }}
          />
        ));
    }
  };

  const titles: Record<Page, string> = {
    root: target?.title ?? "",
    status: "Status",
    reviewer: "Code Reviewer",
    project: "Project",
    move: "Move to codebase",
  };
  // The web `<strong>` around the task title and the app name.
  const strong: TextStyle = { fontWeight: "600", color: theme.foreground };
  const strongClass = "font-instrument-sans-semibold";

  const dialogs = (
    <>
      <MenuSheet
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={titles[page]}
        onBack={page === "root" ? undefined : () => setPage("root")}
      >
        {target ? body(target) : null}
      </MenuSheet>
      {/* The web `DeleteTaskDialog`. */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Task"
        description={
          <>
            Are you sure you want to delete <Text className={strongClass} style={strong}>{deleteTarget?.title}</Text>? This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteTask({ id: deleteTarget._id }).catch(() => toast.error("Could not delete the task. Try again."));
        }}
      />
      {/* The web `MoveTaskDialog`. */}
      <ConfirmDialog
        open={moveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
        title="Move Task"
        description={
          <>
            Move <Text className={strongClass} style={strong}>{moveTarget?.task.title}</Text> to <Text className={strongClass} style={strong}>{moveTarget?.name}</Text>? The
            task will appear in the other app's quick tasks.
          </>
        }
        confirmLabel="Move"
        onConfirm={() => {
          if (!moveTarget) return;
          updateTask({ id: moveTarget.task._id, repoId: moveTarget.repoId }).catch(() =>
            toast.error("Could not move the task. Try again."),
          );
        }}
      />
    </>
  );

  return {
    /** Opens the row menu for one task (the web right-click and kebab menu). */
    openSheet: (task: QuickTask) => {
      setPage("root");
      setTarget(task);
    },
    dialogs,
  };
}
