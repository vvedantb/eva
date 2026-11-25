import { api, type Id } from "@eva/backend";
import {
  MID_TURN_SLEEP_HINT,
  SLEEP_EVA_LABEL,
  taskCanCreatePr,
  taskCanResolveConflicts,
  taskCanStartSandbox,
  WAKE_EVA_LABEL,
  WAKE_EVA_RETRY_LABEL,
} from "@eva/shared";
import {
  IconCloudUpload,
  IconGitMerge,
  IconGitPullRequest,
  IconPlayerPlay,
  IconPlayerStop,
} from "@tabler/icons-react-native";
import { ConfirmDialog, SheetRow, MenuDivider } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { useSimpleView } from "@/chat/ComposerFooter";
import { useSessionSandbox } from "@/chat/SandboxControl";
import { useOwnerPrRow } from "@/reviews/PullRequestsSheet";

type Owner =
  | { kind: "task"; taskId: Id<"agentTasks"> }
  | { kind: "project"; projectId: Id<"projects"> };
type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;
type Task = NonNullable<FunctionReturnType<typeof api.agentTasks.get>>;

/**
 * A task's or project's own sandbox, as the web pages drive it
 * (`useOwnedSession`, `useTaskDetailControls`): its session (made on the first
 * wake, `sessions.ensureOwned`), awake or not, a wake or sleep in flight, and
 * work it has not pushed (Commit & push, `sandbox.commitAndPushSandbox`).
 */
function useOwnedSandbox(owner: Owner | null) {
  const owned = useQuery(api.sessions.getOwnedWithSeed, owner ? { owner } : "skip")
    ?.session;
  const session = useQuery(
    api.sessions.get,
    owned ? { id: owned.sessionId } : "skip",
  );
  const sandbox = useSessionSandbox(owned?.sessionId);
  const ensureOwned = useMutation(api.sessions.ensureOwned);
  const startSandbox = useMutation(api.sessions.startSandbox);
  const commitAndPush = useAction(api.sandbox.commitAndPushSandbox);
  const simpleView = useSimpleView();
  const [waking, setWaking] = useState(false);
  const sync = session?.sandboxGitSync;
  return {
    isActive: sandbox.isActive,
    isToggling: sandbox.isToggling || waking,
    hasStartError: sandbox.startError !== undefined,
    hasUnpushedWork:
      sandbox.isActive &&
      ((sync?.uncommittedFiles ?? 0) > 0 || (sync?.unpushedCommits ?? 0) > 0),
    wake: async () => {
      // A task or project that never had a session gets one first, as the web's `ensureOwned`.
      if (owned) {
        sandbox.toggle("start");
        return;
      }
      if (!owner) return;
      setWaking(true);
      try {
        const { sessionId } = await ensureOwned({ owner });
        await startSandbox({ sessionId });
      } catch {
        toast.error("Could not start the sandbox. Try again.");
      }
      setWaking(false);
    },
    sleep: () => sandbox.toggle("stop"),
    commitPush: () => {
      if (!owned) return;
      commitAndPush({
        target: { kind: "session", sessionId: owned.sessionId },
      }).then(
        () =>
          toast.success(simpleView ? "Saved to GitHub" : "Pushed to GitHub"),
        () => toast.error("Couldn't push the branch"),
      );
    },
  };
}

/** Opens a PR on the phone's PR screen in `repoId` when the URL names one, else in the browser. */
/** The sandbox rows both pages share: wake (or retry) or sleep. */
function SandboxRows({
  sandbox,
  canWake,
  agentActive,
  close,
}: {
  sandbox: ReturnType<typeof useOwnedSandbox>;
  canWake: boolean;
  agentActive: boolean;
  close: () => void;
}) {
  return (
    <>
      {sandbox.isActive ? (
        <SheetRow
          icon={IconPlayerStop}
          title={SLEEP_EVA_LABEL}
          disabled={sandbox.isToggling}
          onPress={() => {
            close();
            // Sleeping mid-turn leaves the turn hanging, as the web warns.
            if (agentActive) toast(MID_TURN_SLEEP_HINT);
            else sandbox.sleep();
          }}
        />
      ) : canWake ? (
        <SheetRow
          icon={IconPlayerPlay}
          title={sandbox.hasStartError ? WAKE_EVA_RETRY_LABEL : WAKE_EVA_LABEL}
          disabled={sandbox.isToggling}
          onPress={() => {
            close();
            void sandbox.wake();
          }}
        />
      ) : null}
    </>
  );
}

/** The web `ResolveConfirmDialog`. */
function ResolveDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Resolve Conflicts"
      description="This will start the agent to merge the latest base branch changes and resolve any conflicts. The task will remain in code review after completion."
      confirmLabel="Resolve Conflicts"
      onConfirm={onConfirm}
    />
  );
}

/**
 * The web quick task page's sandbox and git actions (`TaskFooter`,
 * `TaskFooterMoreMenu`) as rows for its "…" sheet: Wake or Sleep Eva,
 * Commit & push, Create PR, Resolve Conflicts and View PR, each under the
 * web's rule (`@eva/shared` `ownedSandboxRules`). `dialogs` holds the
 * Resolve confirm; render it once, outside the sheet.
 */
export function useTaskGitActions({
  task,
  runCount,
  hasActiveRun,
}: {
  task: Pick<Task, "_id" | "status" | "prUrl" | "projectId" | "repoId">;
  runCount: number;
  hasActiveRun: boolean;
}) {
  const sandbox = useOwnedSandbox({ kind: "task", taskId: task._id });
  const simpleView = useSimpleView();
  const prRow = useOwnerPrRow({ kind: "task", taskId: task._id }, task.prUrl, task.repoId);
  const createTaskPr = useAction(api.taskWorkflowActions.createTaskPr);
  const startExecution = useMutation(api.agentTasks.startExecution);
  const [resolving, setResolving] = useState(false);
  // A project task's PR is its project's: the project page creates it, as the web.
  const canCreatePr =
    task.projectId === undefined &&
    taskCanCreatePr({ latestPrUrl: task.prUrl, runCount, hasActiveRun });
  const canResolve =
    !simpleView &&
    taskCanResolveConflicts(
      task.status === "draft" ? undefined : task.status,
      hasActiveRun,
    );
  const rows = (close: () => void) => (
    <>
      <SandboxRows
        sandbox={sandbox}
        canWake={taskCanStartSandbox(task.status, runCount > 0)}
        agentActive={hasActiveRun}
        close={close}
      />
      {sandbox.hasUnpushedWork ? (
        <SheetRow
          icon={IconCloudUpload}
          title={simpleView ? "Save to GitHub" : "Commit & push"}
          onPress={() => {
            close();
            sandbox.commitPush();
          }}
        />
      ) : null}
      {canCreatePr ? (
        <SheetRow
          icon={IconGitPullRequest}
          title="Create PR"
          onPress={() => {
            close();
            createTaskPr({ taskId: task._id }).then(
              () => toast.success("PR created"),
              () => toast.error("Failed to create PR"),
            );
          }}
        />
      ) : null}
      {canResolve ? (
        <SheetRow
          icon={IconGitMerge}
          title="Resolve Conflicts"
          onPress={() => {
            close();
            setResolving(true);
          }}
        />
      ) : null}
      {prRow.row(close)}
      <MenuDivider />
    </>
  );
  const dialogs = (
    <>
      <ResolveDialog
        open={resolving}
        onOpenChange={setResolving}
        onConfirm={() => {
          startExecution({ id: task._id, mode: "resolve_conflicts" }).catch(() =>
            toast.error("Couldn't resolve conflicts"),
          );
        }}
      />
      {prRow.sheet}
    </>
  );
  return { rows, dialogs };
}

/**
 * The web project page's sandbox actions (`ProjectDetailHeaderActions`) as
 * rows for its "…" sheet: Wake or Sleep Eva, then View PR. The coordinator
 * is read-only, so it has no Commit & push, Create PR or Resolve Conflicts;
 * a project has no closed state, so it can always wake.
 */
export function useProjectGitActions(project: Project | null | undefined) {
  const owner: Owner | null = project ? { kind: "project", projectId: project._id } : null;
  const sandbox = useOwnedSandbox(owner);
  const prRow = useOwnerPrRow(owner ?? undefined, project?.prUrl, project?.repoId);
  const rows = (close: () => void) =>
    project ? (
      <>
        <SandboxRows sandbox={sandbox} canWake agentActive={false} close={close} />
        {prRow.row(close)}
        <MenuDivider />
      </>
    ) : null;
  return { rows, dialogs: prRow.sheet };
}
