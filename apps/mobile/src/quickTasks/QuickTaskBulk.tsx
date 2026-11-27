import { api, type Id } from "@eva/backend";
import { ARCHIVE_LABEL, archiveCopy, type DisplayTaskStatus } from "@eva/shared";
import {
  IconArchive,
  IconFolders,
  IconPlayerPlay,
  IconRefresh,
  IconTags,
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
type Sheet = "status" | "assign" | "labels" | "project" | "run" | "archive";

const plural = (count: number) => `${count} task${count === 1 ? "" : "s"}`;

/**
 * The web Quick Tasks bulk bar (`QuickTasksBulkBar` and its modals) on the
 * phone: once tasks are selected, the bar takes the tab bar's place with
 * Status, Assign and Run, then in More: Assign to Me, Add Labels, Move to
 * project and Archive (the web keeps Archive on the bar; at 390 it does not fit). Each runs the web's per-task writes; Run and
 * Archive ask first, as the web, and Archive offers Undo (`unarchive`), as the
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
  const archiveTask = useMutation(api.agentTasks.archive);
  const unarchiveTask = useMutation(api.agentTasks.unarchive);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const ids = [...selected];
  const count = ids.length;

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

  const copy = archiveCopy("task", count);
  const archive = () => {
    setSheet(null);
    onExitSelect();
    Promise.all(ids.map((id) => archiveTask({ id })))
      .then(() =>
        toast.success(copy.archived, {
          id: "tasks-bulk-archive",
          action: {
            label: "Undo",
            onPress: () => {
              Promise.all(ids.map((id) => unarchiveTask({ id })))
                .then(() => toast.success(copy.unarchived, { id: "tasks-bulk-unarchive" }))
                .catch(() => toast.error(copy.unarchiveFailed, { id: "tasks-bulk-unarchive" }));
            },
          },
        }),
      )
      .catch(() => toast.error(copy.archiveFailed, { id: "tasks-bulk-archive" }));
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
          { key: "archive", label: ARCHIVE_LABEL, icon: IconArchive, disabled: count === 0, onClick: () => setSheet("archive") },
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
        open={sheet === "archive"}
        onOpenChange={(open) => setSheet(open ? "archive" : null)}
        title={copy.confirmTitle}
        confirmLabel={ARCHIVE_LABEL}
        onConfirm={archive}
      />
    </>
  );
}
