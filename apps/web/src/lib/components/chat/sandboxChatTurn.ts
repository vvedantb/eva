import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type {
  AIModel,
  api,
  Id,
  ModelTraitsExecutionArgs,
  ReasoningLevel,
} from "@eva/backend";
import { chatStreamingEntityId } from "@eva/shared";
import {
  annotationSender,
  type AnnotationSubmit,
} from "@/lib/components/sandbox/annotationSend";
import type { ChatDraftTarget } from "./useChatDraftSeed";
import type { ChatEntityRef } from "./sandboxChatSurface";

/**
 * A session chat, or one not created yet: a quick task's session is made on
 * its first need (`sessions.ensureOwned`), so its chat id may still be ahead.
 */
export type SessionChatSource =
  | Id<"sessionChats">
  | (() => Promise<Id<"sessionChats">>);

/**
 * Runs `run` on the chat. A known id runs at once (no extra tick), so the
 * optimistic updates of a session send still apply together.
 */
export function withSessionChat<T>(
  chat: SessionChatSource,
  run: (chatId: Id<"sessionChats">) => Promise<T>,
): Promise<T> {
  return typeof chat === "string" ? run(chat) : chat().then(run);
}

type SessionAddArgs = FunctionArgs<typeof api.sessions.addMessage>;
export type SandboxTurnAddArgs = Omit<SessionAddArgs, "chatId" | "role"> & {
  role?: SessionAddArgs["role"];
};
export type SandboxTurnStartArgs = Omit<
  FunctionArgs<typeof api.sessionWorkflow.startExecute>,
  "chatId" | "attachmentStorageIds" | "sourceProposedPlanId"
>;
export type SandboxTurnEnqueueArgs = Omit<
  FunctionArgs<typeof api.sessionWorkflow.enqueueMessage>,
  "chatId"
>;

/** Start fields passed apart from the composer settings. */
export interface SandboxTurnStartExtras {
  attachmentStorageIds?: Id<"_storage">[];
  sourceProposedPlanId?: Id<"proposedPlans">;
}

/** One chat's workflow mutations, with the chat's id already bound. */
export interface SandboxTurnPorts {
  add: (args: SandboxTurnAddArgs) => Promise<null>;
  start: (
    args: SandboxTurnStartArgs,
    extras: SandboxTurnStartExtras,
  ) => Promise<FunctionReturnType<
    typeof api.sessionWorkflow.startExecute
  > | null>;
  enqueue: (args: SandboxTurnEnqueueArgs) => Promise<null>;
}

/** The composer settings a turn runs on. */
export interface SandboxTurnSettings {
  model: AIModel;
  effortLevel: ReasoningLevel | undefined;
  executionTraits: ModelTraitsExecutionArgs;
  providerAccountId: Id<"userProviderAccounts"> | undefined;
}

export interface SandboxTurnInput {
  message: string;
  displayContent?: string;
  attachmentStorageIds?: Id<"_storage">[];
  sourceProposedPlanId?: Id<"proposedPlans">;
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
  const reasoningLevel = effortLevel ?? executionTraits.reasoningLevel;
  if (mode === "queue") {
    await ports.enqueue({
      message: input.message,
      displayContent: input.displayContent,
      model,
      ...executionTraits,
      reasoningLevel,
      providerAccountId,
      attachmentStorageIds: input.attachmentStorageIds,
    });
    return;
  }
  await Promise.all([
    ports.add({
      content: input.displayContent ?? input.message,
      attachmentStorageIds: input.attachmentStorageIds,
      providerAccountId,
      model,
      reasoningLevel,
    }),
    ports.start(
      {
        message: input.message,
        model,
        ...executionTraits,
        reasoningLevel,
        providerAccountId,
      },
      {
        attachmentStorageIds: input.attachmentStorageIds,
        sourceProposedPlanId: input.sourceProposedPlanId,
      },
    ),
  ]);
}

/**
 * Sends a preview annotation into the chat as display text + rich agent
 * prompt. Queues while a turn runs (see `annotationSender`).
 */
export function sandboxAnnotationSender(
  ports: SandboxTurnPorts,
  settings: SandboxTurnSettings,
  isExecuting: boolean,
): AnnotationSubmit {
  const send = (mode: "queue" | "start") => (display: string, full: string) =>
    sendSandboxTurn(
      ports,
      settings,
      { message: full, displayContent: display },
      mode,
    );
  return annotationSender({
    isExecuting,
    enqueue: send("queue"),
    send: send("start"),
    postError: (content) => ports.add({ role: "assistant", content }),
  });
}

/**
 * The ids and keys one sandbox chat is addressed by; all undefined for a
 * task's or project's chat before its session exists (nothing to read yet).
 */
export function sandboxChatKeys(entity: ChatEntityRef | undefined): {
  parentId: Id<"sessionChats"> | undefined;
  streamingEntityId: string | undefined;
  draftTarget: ChatDraftTarget | undefined;
} {
  if (!entity) {
    return {
      parentId: undefined,
      streamingEntityId: undefined,
      draftTarget: undefined,
    };
  }
  return {
    parentId: entity.chatId,
    streamingEntityId: chatStreamingEntityId(entity.chatId),
    draftTarget: {
      kind: "sessionChat",
      sessionId: entity.sessionId,
      chatId: entity.chatId,
    },
  };
}
