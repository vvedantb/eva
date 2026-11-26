import type { FunctionArgs } from "convex/server";
import type {
  AIModel,
  api,
  Id,
  ModelTraitsExecutionArgs,
  ReasoningLevel,
} from "@eva/backend";
import { chatStreamingEntityId } from "@eva/shared";
import type { PreviewAnnotation } from "@eva/shared/previewAnnotationDisplay";
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

/** `chats.send`, with the chat bound by the ports. */
export type SandboxTurnSendArgs = Omit<
  FunctionArgs<typeof api.chats.send>,
  "target"
>;

/**
 * How the client expects a send to land. The server alone decides; this only
 * picks the optimistic paint: "start" shows the user bubble and opens the
 * turn at once, "queue" waits for the queue row.
 */
export type SandboxTurnExpectation = "queue" | "start";

/** One chat's mutations, with the chat already bound. */
export interface SandboxTurnPorts {
  send: (
    args: SandboxTurnSendArgs,
    expected: SandboxTurnExpectation,
  ) => Promise<null>;
  /** Posts an assistant error row (a failed preview annotation send). */
  postError: (content: string) => Promise<null>;
}

/** The composer settings a turn runs on. */
export interface SandboxTurnSettings {
  model: AIModel;
  /** The effort shown in the picker; the turn and its rows record this one. */
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
  /** Preview annotations: stored on the user row for the comments drawer. */
  annotation?: PreviewAnnotation;
  attachmentStorageIds?: Id<"_storage">[];
  /** Sessions: the proposed plan this turn implements. */
  sourceProposedPlanId?: Id<"proposedPlans">;
}

/**
 * Sends one turn through `chats.send`; the server starts or queues it.
 * `expected` only picks the optimistic paint. Rejects when the server
 * rejects, so a caller can tell a delivered send from a failed one.
 */
export async function sendSandboxTurn(
  ports: SandboxTurnPorts,
  settings: SandboxTurnSettings,
  input: SandboxTurnInput,
  expected: SandboxTurnExpectation,
): Promise<void> {
  const { model, effortLevel, executionTraits, providerAccountId } = settings;
  // The picker's effort wins. The execution payload leaves out the provider
  // default, so it is only the fallback.
  const reasoningLevel = effortLevel ?? executionTraits.reasoningLevel;
  await ports.send(
    {
      message: input.message,
      displayContent: input.displayContent,
      annotation: input.annotation,
      attachmentStorageIds: input.attachmentStorageIds,
      sourceProposedPlanId: input.sourceProposedPlanId,
      settings: {
        model,
        ...executionTraits,
        reasoningLevel,
        providerAccountId,
      },
    },
    expected,
  );
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
  const send =
    (mode: "queue" | "start") =>
    (display: string, full: string, annotation: PreviewAnnotation) =>
      sendSandboxTurn(
        ports,
        settings,
        { message: full, displayContent: display, annotation },
        mode,
      );
  return annotationSender({
    isExecuting,
    enqueue: send("queue"),
    send: send("start"),
    postError: ports.postError,
  });
}

/**
 * The ids and keys one sandbox chat is addressed by; all undefined for a
 * task's or project's chat before its session exists (nothing to read yet).
 */
export function sandboxChatKeys(entity: ChatEntityRef | undefined): {
  parentId: Id<"sessionChats"> | undefined;
  /** The chat's streaming row (a task's runs stream here too). */
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
