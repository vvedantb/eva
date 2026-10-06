"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  api,
  DEFAULT_AI_MODEL,
  findAIModelOption,
  findUsageLimitHold,
  getAIModelProvider,
  normalizeAIModel,
  type AIModel,
  type Id,
} from "@eva/backend";
import { formatModelDisplayLabel, getProviderLabel } from "@eva/ui";
import { ConfirmDialog } from "@/lib/components/quick-tasks/_components/ConfirmDialog";
import { formatResetDistanceMs } from "@/lib/components/usage-limits/_utils";
import { useMinuteNow } from "@/lib/components/usage-limits/_useMinuteNow";
import { catchMutationError } from "@/lib/utils/mutationToast";
import type { ChatBodyMessage, ChatBodyQueuedMessage } from "./chatBodyUtils";

/**
 * What a sandbox chat's queue is waiting on, beyond a running turn, for all
 * three surfaces (session, quick task, project):
 * - a usage limit the newest turn hit. The server holds same-provider messages
 *   until just after the reset (`findUsageLimitHold`); this mirrors it so the
 *   composer queues instead of sending a turn that would only fail again.
 * - a sleeping sandbox. The server wakes Eva and sends once she is up.
 *
 * It also guards the model picker: moving to another provider while messages
 * wait out the limit sends them now, so that switch asks first.
 */
export function useChatQueueGate({
  parentId,
  messages,
  queuedMessages,
  model,
  isSandboxActive,
  setModel,
}: {
  parentId: Id<"sessions"> | Id<"agentTasks"> | Id<"projects">;
  messages: ReadonlyArray<ChatBodyMessage>;
  queuedMessages: ReadonlyArray<ChatBodyQueuedMessage>;
  model: AIModel;
  isSandboxActive: boolean;
  setModel: (model: AIModel) => void;
}) {
  const now = useMinuteNow();
  const switchQueuedModel = useMutation(api.queuedMessages.switchModel);
  const [pendingModel, setPendingModel] = useState<AIModel | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const hold = findUsageLimitHold(messages.toReversed(), now);
  const heldProvider =
    hold?.model === undefined
      ? undefined
      : getAIModelProvider(normalizeAIModel(hold.model));
  // Same rule as the server's `usageLimitHoldFor`: an unstamped failed turn
  // holds every provider, a stamped one only its own.
  const isHeldOn = (candidate: string) =>
    hold !== null &&
    (heldProvider === undefined ||
      heldProvider === getAIModelProvider(normalizeAIModel(candidate)));
  const heldCount = queuedMessages.filter((message) =>
    isHeldOn(message.model ?? DEFAULT_AI_MODEL),
  ).length;

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
    if (heldCount > 0 && !isHeldOn(next)) {
      setPendingModel(next);
      return;
    }
    setModel(next);
  };

  const confirmSwitch = (next: AIModel) => {
    setIsSwitching(true);
    // Cleanup is duplicated across `then`/`catch` rather than written once in a
    // `finally`: React Compiler cannot compile a `finally`.
    void catchMutationError(
      switchQueuedModel({ parentId, model: next }),
      "Couldn't send the queued messages",
      "chat-queue-switch-model",
    )
      .then(() => {
        setModel(next);
        setPendingModel(null);
        setIsSwitching(false);
      })
      .catch(() => setIsSwitching(false));
  };

  const pendingLabel =
    pendingModel === null
      ? ""
      : formatModelDisplayLabel(
          getAIModelProvider(pendingModel),
          findAIModelOption(pendingModel).label,
        );
  const heldProviderLabel =
    heldProvider === undefined ? "" : `${getProviderLabel(heldProvider)} `;
  const switchDialog = (
    <ConfirmDialog
      open={pendingModel !== null}
      onOpenChange={(open) => {
        if (!open) setPendingModel(null);
      }}
      title="Send queued messages now?"
      description={`${heldCount} ${heldCount === 1 ? "message is" : "messages are"} waiting for the ${heldProviderLabel}usage limit to reset. Switching to ${pendingLabel} sends ${heldCount === 1 ? "it" : "them"} now.`}
      confirmLabel="Switch and send"
      onConfirm={() => {
        if (pendingModel !== null) confirmSwitch(pendingModel);
      }}
      isLoading={isSwitching}
    />
  );

  return {
    isUsageLimitHeld: isHeldOn(model),
    queueLabel,
    setModel: guardedSetModel,
    switchDialog,
  };
}
