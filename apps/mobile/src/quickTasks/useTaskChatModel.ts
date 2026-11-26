import { api, type AIModel, type Id } from "@eva/backend";
import { useQuery } from "convex/react";

/**
 * The model a task runs on now: its chat's pick, else what the chat starts on.
 * Undefined while loading. The chat is the one place a task's model lives.
 */
export function useTaskChatModel(taskId: Id<"agentTasks">): AIModel | undefined {
  return useQuery(api.sessions.getOwnedWithSeed, { owner: { kind: "task", taskId } })?.model;
}
