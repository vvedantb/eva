"use client";

import { useChatTranscript } from "@/lib/hooks/useChatTranscript";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import {
  api,
  type AIModel,
  type Id,
  type ModelTraitsExecutionArgs,
  type PrOwnerRef,
  type StoredModelTraits,
} from "@eva/backend";
import type { ModelAccount } from "@vvedantb/ui";
import type { PreviewAnnotationTarget } from "@/lib/components/sandbox/annotationSend";
import type { ChatModelPicker } from "./ChatComposer";
import { isChatTurnExecuting } from "./chatBodyUtils";
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

/**
 * Everything that differs between the chats on the shared sandbox panel: a
 * session's chat, a quick task (its owned session's Main chat), a project
 * task or a project. Each builds one (`useSessionChatBinding`,
 * `useTaskChatBinding`, `useProjectChatBinding`); the shared panel and
 * annotation send do the rest.
 */
export interface SandboxChatBinding {
  entity: ChatEntityRef | undefined;
  ownerLabel: "session" | "task" | "project";
  prOwner: PrOwnerRef;
  active: boolean;
  doc:
    | (SandboxChatOwnerDoc & { title: string; sandboxBranch?: string })
    | null
    | undefined;
  intendedBranch?: string;
  model: AIModel;
  setModel: (model: AIModel) => void;
  modelOptions: ChatModelPicker["modelOptions"];
  displayTraits: NonNullable<ChatModelPicker["displayTraits"]>;
  executionTraits: ModelTraitsExecutionArgs;
  onTraitsChange: (partial: Partial<StoredModelTraits>) => void;
  providerAccountId: Id<"userProviderAccounts"> | null | undefined;
  accounts: ReadonlyArray<ModelAccount>;
  resolveAccountId: (
    id: string | null,
  ) => Id<"userProviderAccounts"> | undefined;
  switchProviderAccount: (id: Id<"userProviderAccounts"> | null) => Promise<void>;
  isSwitchingAccount: boolean;
  ports: SandboxTurnPorts;
  cancel: () => Promise<null>;
}

/** The settings the next turn runs on. */
export function sandboxTurnSettings(
  binding: SandboxChatBinding,
): SandboxTurnSettings {
  return {
    model: binding.model,
    effortLevel: binding.displayTraits.effortLevel,
    executionTraits: binding.executionTraits,
    providerAccountId: binding.resolveAccountId(
      binding.providerAccountId ?? null,
    ),
  };
}

/**
 * The chat's settings for a new session made from it (a fork, or a plan
 * implemented in a new session): same model, traits and account.
 */
export function newSessionSettings(binding: SandboxChatBinding) {
  return {
    model: binding.model,
    ...binding.executionTraits,
    reasoningLevel: binding.displayTraits.effortLevel,
    thinkingEnabled: binding.displayTraits.thinkingEnabled,
    use1mContext: binding.displayTraits.use1mContext,
    fastMode: binding.displayTraits.fastMode,
    providerAccountId:
      binding.resolveAccountId(binding.providerAccountId ?? null) ?? null,
  };
}

/** The usage chip's account name; a loading chat is not called Team. */
export function usageAccountLabel(binding: SandboxChatBinding): string {
  if (binding.providerAccountId === null) return "Team";
  return (
    binding.accounts.find((account) => account.id === binding.providerAccountId)
      ?.label ?? "Selected account"
  );
}

/**
 * The chat transcript and whether a turn owns it. Same rule as every chat
 * (`isChatTurnExecuting`); a task's run is a turn in its chat.
 */
export function useSandboxChatTranscript(binding: SandboxChatBinding) {
  const { parentId } = sandboxChatKeys(binding.entity);
  const live = binding.active ? parentId : undefined;
  const status = useHeldQuery(
    api.turns.getChatStatus,
    live ? { entityId: live } : "skip",
  );
  const messages = useChatTranscript(live ?? "skip");
  const isExecuting = isChatTurnExecuting({ status, messages });
  return { messages, isExecuting };
}

/**
 * Sends a preview annotation into the chat as display text + rich agent
 * prompt. Queues while a turn runs (see `annotationSender`).
 */
export function useSandboxAnnotationSend(
  binding: SandboxChatBinding,
): PreviewAnnotationTarget {
  const { isExecuting } = useSandboxChatTranscript(binding);
  return {
    submit: sandboxAnnotationSender(
      binding.ports,
      sandboxTurnSettings(binding),
      isExecuting,
    ),
    chatId: binding.entity?.chatId,
  };
}
