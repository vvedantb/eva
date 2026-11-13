"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { ConfirmDialog } from "@vvedantb/ui";
import { api } from "@eva/backend";
import { catchMutationError } from "@/lib/utils/mutationToast";
import type { ChatEntityRef } from "./sandboxChatSurface";

/** Asks to stop one background agent; the confirm dialog does the rest. */
export type RequestAgentStop = (toolUseId: string, title?: string) => void;

/**
 * Stop for one background agent of the chat, behind a confirm: a stop cannot
 * be undone, and the Stop buttons sit next to View. A chat with no session
 * yet has no agents.
 *
 * `requestStop` only opens the dialog. Render `stopDialog` at the caller's
 * root, outside any popover: a popover closes when the modal takes focus, and
 * a dialog inside it would unmount with it.
 */
export function useStopBackgroundAgent(entity: ChatEntityRef | undefined): {
  requestStop: RequestAgentStop;
  stopDialog: ReactNode;
} {
  const stopSessionAgent = useMutation(
    api.sessionWorkflow.requestStopBackgroundAgent,
  );
  const [target, setTarget] = useState<{
    toolUseId: string;
    title: string | undefined;
  } | null>(null);
  const [isStopping, setIsStopping] = useState(false);

  const stop = async (toolUseId: string) => {
    if (!entity) return;
    const request = stopSessionAgent({ chatId: entity.chatId, toolUseId });
    setIsStopping(true);
    // Either way the dialog closes: a failure has already toasted. Cleanup is
    // repeated in the catch instead of `finally`, which the React Compiler
    // bails on.
    try {
      await catchMutationError(
        request,
        "Couldn't stop background agent",
        "chat-bg-agent-stop",
      );
    } catch {
      setIsStopping(false);
      setTarget(null);
      return;
    }
    setIsStopping(false);
    setTarget(null);
  };

  const stopDialog = (
    <ConfirmDialog
      size="md"
      open={target !== null}
      // Cancel, Escape and outside click are ignored while `pending`.
      onOpenChange={(open) => {
        if (!open) setTarget(null);
      }}
      title="Stop this background agent?"
      description={`${target?.title ? `"${target.title}"` : "The agent"} stops before it finishes. This cannot be undone.`}
      confirmLabel="Stop agent"
      variant="destructive"
      pending={isStopping}
      onConfirm={() => {
        if (target !== null) void stop(target.toolUseId);
      }}
    />
  );

  return {
    requestStop: (toolUseId, title) => setTarget({ toolUseId, title }),
    stopDialog,
  };
}
