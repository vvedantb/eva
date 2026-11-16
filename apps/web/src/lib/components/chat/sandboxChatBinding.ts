"use client";

import { useChatTranscript } from "@/lib/hooks/useChatTranscript";
import type { FunctionReturnType } from "convex/server";
import {
  type api,
  type AIModel,
  type Id,
  type ModelTraitsExecutionArgs,
  type StoredModelTraits,
} from "@eva/backend";
import type { ModelAccount } from "@vvedantb/ui";
import type { AnnotationSubmit } from "@/lib/components/sandbox/annotationSend";
import type { ChatModelPicker } from "./ChatComposer";
import { isChatTurnExecuting, type ChatBodyMessage } from "./chatBodyUtils";
import type {
  ChatEntityRef,
  SandboxChatOwnerDoc,
} from "./sandboxChatSurface";
import {
  sandboxAnnotationSender,
  sandboxChatKeys,
  type SandboxTurnPorts,
  type SandboxTurnSettings,
} from "./sandboxChatTurn";
import { useChatTurnStatus } from "./useChatTurnOpen";

type StreamingRow = FunctionReturnType<typeof api.streaming.get>;

/**
 * Everything that differs between the chats on the shared sandbox panel: a
 * quick task (its owned session's Main chat), a project task or a project.
 * Each builds one (`useTaskChatBinding`, `useProjectChatBinding`); the shared
 * panel and annotation send do the rest.
 */
export interface SandboxChatBinding {
  /** The owner's chat on its session; undefined until the session exists. */
  entity: ChatEntityRef | undefined;
  /** What the chat speaks for, for copy. */
  ownerLabel: "task" | "project";
  /** The entity's live doc; undefined while it loads. */
  doc:
    | (SandboxChatOwnerDoc & { title: string; sandboxBranch?: string })
    | null
    | undefined;
  /** The branch Eva booted the sandbox on, when the entity pins one. */
  intendedBranch?: string;
  model: AIModel;
  setModel: (model: AIModel) => void;
  modelOptions: ChatModelPicker["modelOptions"];
  displayTraits: NonNullable<ChatModelPicker["displayTraits"]>;
  executionTraits: ModelTraitsExecutionArgs;
  onTraitsChange: (partial: Partial<StoredModelTraits>) => void;
  /** The sticky account; null = Team. */
  providerAccountId: Id<"userProviderAccounts"> | null;
  /**
   * The owner's accounts: the chat runs on the owner's credentials whoever
   * sends, so any viewer picks from these (as in a session chat).
   */
  accounts: ReadonlyArray<ModelAccount>;
  resolveAccountId: (
    id: string | null,
  ) => Id<"userProviderAccounts"> | undefined;
  persistAccount: (id: Id<"userProviderAccounts"> | null) => Promise<unknown>;
  prewarm: () => Promise<unknown>;
  ports: SandboxTurnPorts;
  /** Stops whatever turn owns the chat bubble. */
  cancel: () => Promise<null>;
  /** A quick task's first run, shown as the chat's opening turn. */
  firstRun?: {
    isInProgress: boolean;
    streaming: StreamingRow | undefined;
    turn: ChatBodyMessage[];
  };
}

/** The settings the next turn runs on. */
export function sandboxTurnSettings(
  binding: SandboxChatBinding,
): SandboxTurnSettings {
  return {
    model: binding.model,
    effortLevel: binding.displayTraits.effortLevel,
    executionTraits: binding.executionTraits,
    providerAccountId: binding.resolveAccountId(binding.providerAccountId),
  };
}

/**
 * The chat transcript and whether a turn owns it. Same rule as every chat
 * (`isChatTurnExecuting`); a running first run counts as a turn.
 */
export function useSandboxChatTranscript(binding: SandboxChatBinding) {
  const { parentId } = sandboxChatKeys(binding.entity);
  const status = useChatTurnStatus(parentId);
  const messages = useChatTranscript(parentId ?? "skip");
  const isExecuting = isChatTurnExecuting({
    status,
    messages,
    isFirstRunInProgress: binding.firstRun?.isInProgress,
  });
  return { messages, isExecuting };
}

/**
 * Sends a preview annotation into the chat as display text + rich agent
 * prompt. Queues while a turn runs (see `annotationSender`).
 */
export function useSandboxAnnotationSend(
  binding: SandboxChatBinding,
): AnnotationSubmit {
  const { isExecuting } = useSandboxChatTranscript(binding);
  return sandboxAnnotationSender(
    binding.ports,
    sandboxTurnSettings(binding),
    isExecuting,
  );
}
