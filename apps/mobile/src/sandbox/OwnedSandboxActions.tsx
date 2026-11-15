import { api, type Id } from "@eva/backend";
import {
  isProjectPreviewPhase,
  MID_TURN_SLEEP_HINT,
  prNumberFromGithubUrl,
  projectCanCreatePr,
  projectCanResolveConflicts,
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
import { ConfirmDialog, SheetRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking } from "react-native";
import { useSimpleView } from "@/chat/ComposerFooter";
import { useSessionSandbox } from "@/chat/SandboxControl";
import { MenuDivider } from "@/ui/MenuSheet";

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
  const owned = useQuery(api.sessions.getOwned, owner ? { owner } : "skip");
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
function useOpenPr(repoId: Id<"githubRepos"> | undefined) {
  const router = useRouter();
  return (prUrl: string) => {
    const prNumber = prNumberFromGithubUrl(prUrl);
    if (prNumber !== undefined && repoId) {
      router.push({
        pathname: "/review/[repoId]/[prNumber]",
        params: { repoId, prNumber: String(prNumber) },
      });
    } else {
      void Linking.openURL(prUrl);
    }
  };
}

/** The sandbox rows both pages share: wake (or retry) or sleep, then Commit & push while there is work. */
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
  const simpleView = useSimpleView();
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
  const openPr = useOpenPr(task.repoId);
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
      {task.prUrl && !simpleView ? (
        <SheetRow
          icon={IconGitPullRequest}
          title="View PR"
          onPress={() => {
            close();
            if (task.prUrl) openPr(task.prUrl);
          }}
        />
      ) : null}
      <MenuDivider />
    </>
  );
  const dialogs = (
    <ResolveDialog
      open={resolving}
      onOpenChange={setResolving}
      onConfirm={() => {
        startExecution({ id: task._id, mode: "resolve_conflicts" }).catch(() =>
          toast.error("Couldn't resolve conflicts"),
        );
      }}
    />
  );
  return { rows, dialogs };
}

/**
 * The web project page's sandbox and git actions
 * (`ProjectDetailHeaderActions`) as rows for its "…" sheet: Wake or Sleep
 * Eva (in the preview phases), Commit & push, Create PR, Resolve Conflicts
 * and View PR, under the web's rules. `dialogs` holds the Resolve confirm.
 */
export function useProjectGitActions(project: Project | null | undefined) {
  const sandbox = useOwnedSandbox(
    project ? { kind: "project", projectId: project._id } : null,
  );
  const simpleView = useSimpleView();
  const openPr = useOpenPr(project?.repoId);
  const createProjectPr = useAction(api.taskWorkflowActions.createProjectPr);
  const resolveConflicts = useMutation(api.projects.resolveProjectConflicts);
  const [resolving, setResolving] = useState(false);
  const rows = (close: () => void) =>
    project ? (
      <>
        <SandboxRows
          sandbox={sandbox}
          canWake={isProjectPreviewPhase(project.phase)}
          agentActive={false}
          close={close}
        />
        {projectCanCreatePr(project) ? (
          <SheetRow
            icon={IconGitPullRequest}
            title="Create PR"
            onPress={() => {
              close();
              createProjectPr({ projectId: project._id }).then(
                () => toast.success("PR created"),
                () => toast.error("Failed to create PR"),
              );
            }}
          />
        ) : null}
        {projectCanResolveConflicts(project) ? (
          <SheetRow
            icon={IconGitMerge}
            title="Resolve Conflicts"
            onPress={() => {
              close();
              setResolving(true);
            }}
          />
        ) : null}
        {project.prUrl && !simpleView ? (
          <SheetRow
            icon={IconGitPullRequest}
            title="View PR"
            onPress={() => {
              close();
              if (project.prUrl) openPr(project.prUrl);
            }}
          />
        ) : null}
        <MenuDivider />
      </>
    ) : null;
  const dialogs = (
    <ResolveDialog
      open={resolving}
      onOpenChange={setResolving}
      onConfirm={() => {
        if (project)
          resolveConflicts({ projectId: project._id }).catch(() =>
            toast.error("Couldn't resolve conflicts"),
          );
      }}
    />
  );
  return { rows, dialogs };
}
