import { api, type Id } from "@eva/backend";
import type { DisplayTaskStatus } from "@eva/shared";
import {
  IconFolders,
  IconPlayerPlay,
  IconRefresh,
  IconTags,
  IconTrash,
  IconUser,
  IconUserCheck,
} from "@tabler/icons-react-native";
import { BulkActionBar, ConfirmDialog } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { FooterSheet } from "@/chat/ComposerFooter";
import { ProjectSheet, ReviewerSheet, TagsSheet, TaskStatusRows } from "@/quickTasks/OptionChips";

type QuickTask = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];
type Project = FunctionReturnType<typeof api.projects.list>[number];
type Sheet = "status" | "assign" | "labels" | "project" | "run" | "delete";

const plural = (count: number) => `${count} task${count === 1 ? "" : "s"}`;

/**
 * The web Quick Tasks bulk bar (`QuickTasksBulkBar` and its modals) on the
 * phone: once tasks are selected, the bar takes the tab bar's place with
 * Status, Assign and Run, then in More: Assign to Me, Add Labels, Move to
 * project and Delete (the web keeps Delete on the bar; at 390 it does not fit). Each runs the web's per-task writes; Run and
 * Delete ask first, as the web, and Delete offers Undo (`restore`), as the
 * web toast. Status, Assign and the project close the bar once applied; Add
 * Labels adds the picked tags to each task when its sheet closes.
 */
export function QuickTaskBulkBar({
  isSelecting,
  selected,
  tasks,
  totalCount,
  users,
  projects,
  allTags,
  currentUserId,
  onExitSelect,
  onSelectAll,
  onClearSelection,
}: {
  isSelecting: boolean;
  selected: ReadonlySet<Id<"agentTasks">>;
  /** The listed tasks, to read each selected task's tags. */
  tasks: readonly QuickTask[];
  totalCount: number;
  users: User[] | undefined;
  projects: Project[] | undefined;
  allTags: string[];
  currentUserId: Id<"users"> | null | undefined;
  onExitSelect: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}) {
  const updateStatus = useMutation(api.agentTasks.updateStatus);
  const updateTask = useMutation(api.agentTasks.update);
  const startExecution = useMutation(api.agentTasks.startExecution);
  const assignToProject = useMutation(api.agentTasks.assignToProject);
  const removeTask = useMutation(api.agentTasks.remove);
  const restoreTask = useMutation(api.agentTasks.restore);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const ids = [...selected];
  const count = ids.length;

  /** Runs one write per task, then leaves select mode and says how it went. */
  const each = (write: (id: Id<"agentTasks">) => Promise<unknown>, done: string, failure: string) => {
    setSheet(null);
    onExitSelect();
    Promise.all(ids.map((id) => write(id)))
      .then(() => toast.success(done))
      .catch(() => toast.error(failure));
  };

  const run = async () => {
    setSheet(null);
    onExitSelect();
    // As the web `useBulkRunTasks`: each start on its own, and the count of those that started.
    const results = await Promise.all(
      ids.map((id) =>
        startExecution({ id }).then(
          () => true,
          () => false,
        ),
      ),
    );
    const started = results.filter(Boolean).length;
    if (started === count) toast.success(`Started ${plural(started)}`);
    else toast.error(`Started ${started} of ${plural(count)}`);
  };

  const remove = () => {
    setSheet(null);
    onExitSelect();
    Promise.all(ids.map((id) => removeTask({ id })))
      .then(() =>
        // A soft delete: Undo restores each row (the sandbox and a scheduled run do not come back, as the web says).
        toast.success(`${plural(count)} deleted`, {
          action: {
            label: "Undo",
            onPress: () => {
              Promise.all(ids.map((id) => restoreTask({ id })))
                .then(() => toast.success(`${plural(count)} restored`))
                .catch(() => toast.error("Couldn't restore tasks"));
            },
          },
        }),
      )
      .catch(() => toast.error("Couldn't delete tasks"));
  };

  const addLabels = () => {
    const tags = pickedTags;
    setPickedTags([]);
    if (tags.length === 0) {
      setSheet(null);
      return;
    }
    const byId = new Map(tasks.map((task) => [task._id, task]));
    each(
      (id) => updateTask({ id, tags: [...new Set([...(byId.get(id)?.tags ?? []), ...tags])] }),
      `Added labels to ${plural(count)}`,
      "Couldn't add labels",
    );
  };

  return (
    <>
      <BulkActionBar
        barKey="quick-tasks-bulk-bar"
        isSelecting={isSelecting}
        selectedCount={count}
        totalCount={totalCount}
        onExitSelect={onExitSelect}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        placement="tabBar"
        // The web bar's three, with its short labels so four controls fit at 390.
        primaryActions={[
          { key: "status", label: "Change Status", shortLabel: "Status", icon: IconRefresh, disabled: count === 0, onClick: () => setSheet("status") },
          { key: "assign", label: "Assign to...", shortLabel: "Assign", icon: IconUser, disabled: count === 0, onClick: () => setSheet("assign") },
          { key: "run", label: "Run Tasks", shortLabel: "Run", icon: IconPlayerPlay, disabled: count === 0, onClick: () => setSheet("run") },
        ]}
        moreActions={[
          {
            key: "assignMe",
            label: "Assign to Me",
            icon: IconUserCheck,
            disabled: count === 0 || !currentUserId,
            onClick: () => {
              if (currentUserId) each((id) => updateTask({ id, assignedTo: currentUserId }), `Assigned ${plural(count)} to you`, "Couldn't assign tasks");
            },
          },
          { key: "labels", label: "Add Labels", icon: IconTags, disabled: count === 0, onClick: () => setSheet("labels") },
          { key: "project", label: "Move to project", icon: IconFolders, disabled: count === 0, onClick: () => setSheet("project") },
          // In More, not on the bar: with "Select all" and More, a fifth control does not fit at 390.
          { key: "delete", label: "Delete All", icon: IconTrash, destructive: true, disabled: count === 0, onClick: () => setSheet("delete") },
        ]}
      />

      <FooterSheet open={sheet === "status"} onOpenChange={(open) => setSheet(open ? "status" : null)} title={`Status for ${plural(count)}`}>
        <TaskStatusRows
          value="draft"
          onPick={(status: DisplayTaskStatus) =>
            each((id) => updateStatus({ id, status }), `Moved ${plural(count)}`, "Couldn't change the status")
          }
        />
      </FooterSheet>
      <ReviewerSheet
        open={sheet === "assign"}
        onOpenChange={(open) => setSheet(open ? "assign" : null)}
        users={users}
        value={undefined}
        onChange={(assignedTo) =>
          each((id) => updateTask({ id, assignedTo: assignedTo ?? null }), `Assigned ${plural(count)}`, "Couldn't assign tasks")
        }
      />
      <TagsSheet
        open={sheet === "labels"}
        onOpenChange={(open) => (open ? setSheet("labels") : addLabels())}
        allTags={allTags}
        value={pickedTags}
        onChange={setPickedTags}
      />
      <ProjectSheet
        open={sheet === "project"}
        onOpenChange={(open) => setSheet(open ? "project" : null)}
        projects={projects}
        value={undefined}
        onChange={(projectId) => {
          if (!projectId) {
            each((id) => updateTask({ id, projectId: null }), `Removed ${plural(count)} from their project`, "Couldn't change the project");
            return;
          }
          // One call for all, as the web "Add to project".
          setSheet(null);
          onExitSelect();
          assignToProject({ taskIds: ids, projectId })
            .then(() => toast.success(`Added ${plural(count)} to project`))
            .catch(() => toast.error("Couldn't add tasks to project"));
        }}
      />
      <ConfirmDialog
        open={sheet === "run"}
        onOpenChange={(open) => setSheet(open ? "run" : null)}
        title={`Run ${plural(count)}?`}
        description={`Eva will start working on the selected ${count === 1 ? "task" : "tasks"} immediately.`}
        confirmLabel={`Run ${plural(count)}`}
        onConfirm={() => void run()}
      />
      <ConfirmDialog
        open={sheet === "delete"}
        onOpenChange={(open) => setSheet(open ? "delete" : null)}
        title={`Delete ${plural(count)}?`}
        description={`The selected ${count === 1 ? "task" : "tasks"} will be removed from every list. Undo is offered once, in the message that follows; the sandbox and any scheduled run are gone either way.`}
        confirmLabel={`Delete ${plural(count)}`}
        variant="destructive"
        onConfirm={remove}
      />
    </>
  );
}
