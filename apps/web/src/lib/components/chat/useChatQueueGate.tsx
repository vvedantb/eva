"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  api,
  DEFAULT_AI_MODEL,
  findAIModelOption,
  findUsageLimitHold,
  getAIModelProvider,
  isHeldByUsageLimit,
  normalizeAIModel,
  type AIModel,
  type Id,
} from "@eva/backend";
import {
  formatModelDisplayLabel,
  getProviderLabel,
  type ModelAccount,
} from "@eva/ui";
import { ConfirmDialog } from "@/lib/components/quick-tasks/_components/ConfirmDialog";
import { formatResetDistanceMs } from "@/lib/components/usage-limits/_utils";
import { useMinuteNow } from "@/lib/components/usage-limits/_useMinuteNow";
import { resolveCredentialSourceLabel } from "@/lib/utils/credentialSourceLabel";
import { catchMutationError } from "@/lib/utils/mutationToast";
import type { ChatBodyMessage, ChatBodyQueuedMessage } from "./chatBodyUtils";

/** "the Team account" or "Ana's account", as the usage-limit banner names it. */
function accountLabel(credentialLabel: string): string {
  return credentialLabel === "Team"
    ? "the Team account"
    : `${credentialLabel}'s account`;
}

/** A picker change that would send the held queue now, waiting on a confirm. */
type PendingSwitch =
  | { kind: "model"; model: AIModel }
  | { kind: "account"; accountId: string | null };

/**
 * What a sandbox chat's queue is waiting on, beyond a running turn, for all
 * three surfaces (session, quick task, project):
 * - a usage limit the newest turn hit. The server holds messages on that same
 *   credential (provider + account) until just after the reset
 *   (`isHeldByUsageLimit`); this mirrors it so the composer queues instead of
 *   sending a turn that would only fail again.
 * - a sleeping sandbox. The server wakes Eva and sends once she is up.
 *
 * It also guards the model and account pickers: moving to another provider or
 * another account while messages wait out the limit sends them now, so that
 * switch asks first.
 */
export function useChatQueueGate({
  parentId,
  messages,
  queuedMessages,
  model,
  accountId,
  accounts,
  resolveAccountId,
  isSandboxActive,
  setModel,
  setAccount,
}: {
  parentId: Id<"sessions"> | Id<"agentTasks"> | Id<"projects">;
  messages: ReadonlyArray<ChatBodyMessage>;
  queuedMessages: ReadonlyArray<ChatBodyQueuedMessage>;
  model: AIModel;
  /** The composer's account; null = Team. */
  accountId: string | null;
  accounts: ReadonlyArray<Pick<ModelAccount, "id" | "label">>;
  resolveAccountId: (
    id: string | null,
  ) => Id<"userProviderAccounts"> | undefined;
  isSandboxActive: boolean;
  setModel: (model: AIModel) => void;
  /** Persists the pick; resolves once the replacement daemon is warm. */
  setAccount: (accountId: string | null) => Promise<void>;
}) {
  const now = useMinuteNow();
  const switchQueuedCredential = useMutation(
    api.queuedMessages.switchCredential,
  );
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const hold = findUsageLimitHold(messages.toReversed(), now);
  const heldCount = queuedMessages.filter((message) =>
    isHeldByUsageLimit(
      hold,
      message.model ?? DEFAULT_AI_MODEL,
      message.providerAccountId ?? null,
    ),
  ).length;
  /** Whether a picker change moves the held queue off the exhausted credential. */
  const releasesQueue = (nextModel: AIModel, nextAccountId: string | null) =>
    heldCount > 0 && !isHeldByUsageLimit(hold, nextModel, nextAccountId);

  /** The queue panel's heading: why the queued messages have not sent. */
  const queueLabel = (isExecuting: boolean): string | undefined => {
    if (isExecuting || queuedMessages.length === 0) return undefined;
    if (hold !== null && heldCount > 0) {
      return `Queued · sends in ${formatResetDistanceMs(hold.resumeAt - now)}`;
    }
    if (!isSandboxActive) return "Queued · sends when Eva wakes up";
    return undefined;
  };

  const guardedSetModel = (next: AIModel) => {
    if (releasesQueue(next, accountId)) {
      setPending({ kind: "model", model: next });
      return;
    }
    setModel(next);
  };

  const guardedSetAccount = (next: string | null) => {
    if (releasesQueue(model, next)) {
      setPending({ kind: "account", accountId: next });
      return;
    }
    void setAccount(next);
  };

  const confirmSwitch = (next: PendingSwitch) => {
    setIsSwitching(true);
    const nextModel = next.kind === "model" ? next.model : model;
    const nextAccountId = next.kind === "account" ? next.accountId : accountId;
    // An account switch waits for the replacement daemon first, so the queue
    // cannot send on the exhausted credential's warm daemon.
    const ready =
      next.kind === "account" ? setAccount(next.accountId) : Promise.resolve();
    // Cleanup is duplicated across `then`/`catch` rather than written once in a
    // `finally`: React Compiler cannot compile a `finally`.
    void catchMutationError(
      ready.then(() =>
        switchQueuedCredential({
          parentId,
          model: nextModel,
          providerAccountId: resolveAccountId(nextAccountId),
        }),
      ),
      "Couldn't send the queued messages",
      "chat-queue-switch-credential",
    )
      .then(() => {
        if (next.kind === "model") setModel(next.model);
        setPending(null);
        setIsSwitching(false);
      })
      .catch(() => setIsSwitching(false));
  };

  const heldLabel =
    hold?.model === undefined
      ? ""
      : `${getProviderLabel(getAIModelProvider(normalizeAIModel(hold.model)))} `;
  const pendingLabel =
    pending === null
      ? ""
      : pending.kind === "model"
        ? formatModelDisplayLabel(
            getAIModelProvider(pending.model),
            findAIModelOption(pending.model).label,
          )
        : accountLabel(
            resolveCredentialSourceLabel(pending.accountId, accounts),
          );
  const switchDialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      title="Send queued messages now?"
      description={`${heldCount} ${heldCount === 1 ? "message is" : "messages are"} waiting for the ${heldLabel}usage limit to reset. Switching to ${pendingLabel} sends ${heldCount === 1 ? "it" : "them"} now.`}
      confirmLabel="Switch and send"
      onConfirm={() => {
        if (pending !== null) confirmSwitch(pending);
      }}
      isLoading={isSwitching}
    />
  );

  return {
    isUsageLimitHeld: isHeldByUsageLimit(hold, model, accountId),
    queueLabel,
    setModel: guardedSetModel,
    setAccount: guardedSetAccount,
    switchDialog,
  };
}
