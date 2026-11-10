import type { FunctionArgs } from "convex/server";
import type {
  AIModel,
  api,
  Id,
  ModelTraitsExecutionArgs,
  ReasoningLevel,
} from "@eva/backend";
import type { ChatDraftTarget } from "./useChatDraftSeed";
import type { ChatEntityRef } from "./sandboxChatSurface";

/**
 * The chats that run on an entity-owned sandbox workflow
 * (`agentTaskChatWorkflow` / `projectChatWorkflow`). Sessions use
 * `api.sessions.*` and have their own send path (`useChatSend`).
 */
export type SandboxChatEntity = Extract<
  ChatEntityRef,
  { kind: "task" | "project" }
>;

// The project validators are the canonical shape: the task validators accept
// the same fields plus orchestrator-only extras, so a binding that spreads
// these into either workflow type-checks, and a drift breaks the build.
export type SandboxTurnAddArgs = Omit<
  FunctionArgs<typeof api.projectChatWorkflow.addMessage>,
  "projectId"
>;
export type SandboxTurnStartArgs = Omit<
  FunctionArgs<typeof api.projectChatWorkflow.startExecute>,
  "projectId"
>;
export type SandboxTurnEnqueueArgs = Omit<
  FunctionArgs<typeof api.projectChatWorkflow.enqueueMessage>,
  "projectId"
>;

/** One entity's chat workflow mutations, with the entity id already bound. */
export interface SandboxTurnPorts {
  add: (args: SandboxTurnAddArgs) => Promise<null>;
  start: (args: SandboxTurnStartArgs) => Promise<null>;
  enqueue: (args: SandboxTurnEnqueueArgs) => Promise<null>;
}

/** The composer settings a turn runs on. */
export interface SandboxTurnSettings {
  model: AIModel;
  /** The effort shown in the picker; the chat row records this one. */
  effortLevel: ReasoningLevel | undefined;
  executionTraits: ModelTraitsExecutionArgs;
  /** Already resolved from the picker id; undefined = Team credential. */
  providerAccountId: Id<"userProviderAccounts"> | undefined;
}

export interface SandboxTurnInput {
  /** What the agent receives. */
  message: string;
  /** Compact chat text when `message` is a rich prompt (preview annotations). */
  displayContent?: string;
  attachmentStorageIds?: Id<"_storage">[];
}

/**
 * Delivers one turn. `queue` parks it behind the running turn; `start` posts
 * the user row and starts the turn. Rejects when the server rejects, so a
 * caller can tell a delivered send from a failed one.
 */
export async function sendSandboxTurn(
  ports: SandboxTurnPorts,
  settings: SandboxTurnSettings,
  input: SandboxTurnInput,
  mode: "queue" | "start",
): Promise<void> {
  const { model, effortLevel, executionTraits, providerAccountId } = settings;
  if (mode === "queue") {
    await ports.enqueue({
      message: input.message,
      displayContent: input.displayContent,
      model,
      ...executionTraits,
      reasoningLevel: effortLevel ?? executionTraits.reasoningLevel,
      providerAccountId,
      attachmentStorageIds: input.attachmentStorageIds,
    });
    return;
  }
  // Fired together, not one after the other: `startExecute`'s optimistic
  // status must apply at once, so a second send before the server answers
  // queues. Convex runs one client's mutations in order, so the user row
  // still lands first.
  await Promise.all([
    ports.add({
      content: input.displayContent ?? input.message,
      attachmentStorageIds: input.attachmentStorageIds,
      providerAccountId,
      model,
      reasoningLevel: effortLevel,
    }),
    ports.start({
      message: input.message,
      model,
      ...executionTraits,
      providerAccountId,
    }),
  ]);
}

/** The ids and keys one sandbox chat is addressed by. */
export function sandboxChatKeys(entity: SandboxChatEntity): {
  parentId: Id<"agentTasks"> | Id<"projects">;
  /** The chat's streaming row (not the first-run row). */
  streamingEntityId: string;
  draftTarget: ChatDraftTarget;
} {
  switch (entity.kind) {
    case "task":
      return {
        parentId: entity.taskId,
        streamingEntityId: `task-chat-${entity.taskId}`,
        draftTarget: { kind: "taskChat", taskId: entity.taskId },
      };
    case "project":
      return {
        parentId: entity.projectId,
        streamingEntityId: `project-chat-${entity.projectId}`,
        draftTarget: { kind: "projectChat", projectId: entity.projectId },
      };
  }
}
