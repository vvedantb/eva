import type { FunctionArgs } from "convex/server";
import type { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  PROJECT_CHAT_DAEMON_MUTATIONS,
  TASK_CHAT_DAEMON_MUTATIONS,
} from "../_sandbox_runtime/daemonPaths";
import type { ModelTraitsExecutionArgs } from "../_validators/aiModels";
import {
  projectChatStreamEntityId,
  taskChatStreamEntityId,
} from "./agentStreamIds";

/**
 * One `prewarmEntityDaemon` payload per chat surface (task chat, project chat).
 * Every prewarm site (send path, workflow step, page-open prewarm, account
 * switch) builds it here so the daemon opts sig cannot drift between them: a
 * mismatched sig kills the warm daemon.
 *
 * Keep the field set and values stable. The workflow step journals these args
 * (`convexToJson` sorts keys and drops `undefined`), so adding, removing or
 * renaming a field strands in-flight workflows with "Journal entry mismatch".
 */

export const CHAT_ALLOWED_TOOLS = "Read,Write,Edit,Bash,Glob,Grep";

type PrewarmEntityDaemonArgs = FunctionArgs<
  typeof internal.sandbox.prewarmEntityDaemon
>;

type ChatDaemonLaunchParams = {
  sandboxId: string;
  repoId: Id<"githubRepos">;
  userId: Id<"users">;
  model: string;
  traits: ModelTraitsExecutionArgs;
  providerAccountId: Id<"userProviderAccounts"> | undefined;
  credentialOwnerUserId: Id<"users"> | undefined;
};

export function taskChatDaemonLaunchArgs(
  p: ChatDaemonLaunchParams & { taskId: Id<"agentTasks"> },
): PrewarmEntityDaemonArgs {
  return {
    sandboxId: p.sandboxId,
    repoId: p.repoId,
    userId: p.userId,
    entityId: String(p.taskId),
    streamingEntityId: taskChatStreamEntityId(p.taskId),
    entityIdField: "taskId",
    completionMutation: "agentTaskChatWorkflow:handleCompletion",
    ...TASK_CHAT_DAEMON_MUTATIONS,
    model: p.model,
    ...p.traits,
    allowedTools: CHAT_ALLOWED_TOOLS,
    providerAccountId: p.providerAccountId,
    credentialOwnerUserId: p.credentialOwnerUserId,
    sessionPersistenceId: p.taskId,
    activeWorkflowField: "activeChatWorkflowId",
    skipPrewarm: false,
    entityTable: "agentTasks",
  };
}

export function projectChatDaemonLaunchArgs(
  p: ChatDaemonLaunchParams & { projectId: Id<"projects"> },
): PrewarmEntityDaemonArgs {
  return {
    sandboxId: p.sandboxId,
    repoId: p.repoId,
    userId: p.userId,
    entityId: String(p.projectId),
    streamingEntityId: projectChatStreamEntityId(p.projectId),
    entityIdField: "projectId",
    completionMutation: "projectChatWorkflow:handleCompletion",
    ...PROJECT_CHAT_DAEMON_MUTATIONS,
    model: p.model,
    ...p.traits,
    allowedTools: CHAT_ALLOWED_TOOLS,
    providerAccountId: p.providerAccountId,
    credentialOwnerUserId: p.credentialOwnerUserId,
    sessionPersistenceId: p.projectId,
    activeWorkflowField: "activeChatWorkflowId",
    skipPrewarm: false,
    entityTable: "projects",
  };
}
