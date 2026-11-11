"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api, type Doc, type Id, type SandboxOwner } from "@eva/backend";
import type { SessionChatSource } from "@/lib/components/chat/sandboxChatTurn";

type SandboxGitTarget = FunctionArgs<
  typeof api.sandbox.commitAndPushSandbox
>["target"];

/** The sandbox fields a task page reads, wherever they live. */
export interface TaskSandboxFields {
  sandboxId: string | undefined;
  status: Doc<"sessions">["status"] | undefined;
  devPort: number | undefined;
  devCommand: string | undefined;
  terminalPanes: Doc<"sessions">["terminalPanes"];
  agentBrowsingAt: number | undefined;
  sandboxGitSync: Doc<"sessions">["sandboxGitSync"];
  /** Panes, preview and PTYs are keyed by this owner. */
  owner: SandboxOwner;
  /** Commit & push target for the sandbox checkout. */
  gitTarget: SandboxGitTarget;
}

/**
 * A task's sandbox. A quick task runs on its owned session
 * (`sessions.owner = { kind: "task" }`): the session holds the sandbox and its
 * Main chat holds the transcript. That session only exists once something
 * needed it, so `ensure` creates it on the first send or Start (an event, not
 * a render). A project task keeps the sandbox fields on its own row.
 */
export function useTaskSession(
  taskId: Id<"agentTasks">,
  task: Doc<"agentTasks"> | null | undefined,
) {
  const isQuickTask = task != null && task.projectId === undefined;
  const owned = useQuery(
    api.sessions.getOwned,
    isQuickTask ? { taskId } : "skip",
  );
  const session = useQuery(
    api.sessions.get,
    owned ? { id: owned.sessionId } : "skip",
  );
  const ensureOwned = useMutation(api.sessions.ensureOwned);

  const ensure = async () => owned ?? (await ensureOwned({ taskId }));
  const chatSource: SessionChatSource =
    owned?.chatId ?? (async () => (await ensure()).chatId);

  const sandbox: TaskSandboxFields = isQuickTask
    ? {
        sandboxId: session?.sandboxId,
        status: session?.status,
        devPort: session?.devPort,
        devCommand: session?.devCommand,
        terminalPanes: session?.terminalPanes,
        agentBrowsingAt: session?.agentBrowsingAt,
        sandboxGitSync: session?.sandboxGitSync,
        owner: owned
          ? { kind: "session", sessionId: owned.sessionId }
          : { kind: "task", taskId },
        gitTarget: owned
          ? { kind: "session", sessionId: owned.sessionId }
          : { kind: "task", taskId },
      }
    : {
        sandboxId: task?.sandboxId,
        status: task?.reviewTaskSandboxStatus,
        devPort: task?.devPort,
        devCommand: task?.devCommand,
        terminalPanes: task?.terminalPanes,
        agentBrowsingAt: task?.agentBrowsingAt,
        sandboxGitSync: task?.sandboxGitSync,
        owner: { kind: "task", taskId },
        gitTarget: { kind: "task", taskId },
      };

  return {
    isQuickTask,
    /** The session and its Main chat; null until first needed. */
    owned,
    session,
    /** Returns the session, creating it (no sandbox start) when missing. */
    ensure,
    /** The Main chat, or a resolver that creates it on first use. */
    chatSource,
    sandbox,
  };
}

export type TaskSession = ReturnType<typeof useTaskSession>;
