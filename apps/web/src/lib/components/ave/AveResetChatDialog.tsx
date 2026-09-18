"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { ConfirmDialog } from "@/lib/components/quick-tasks/_components/ConfirmDialog";
import { withMutationToast } from "@/lib/utils/mutationToast";

/** Resets Manager Ave. Shared by the confirm dialog and Alt-click bypass. */
export function useResetOrchestratorChat() {
  const resetChat = useMutation(api.sessions.resetOrchestratorSession);
  const [isResetting, setIsResetting] = useState(false);

  const reset = async (): Promise<boolean> => {
    setIsResetting(true);
    try {
      await withMutationToast(
        resetChat({}),
        "Started a new Manager Ave chat",
        "Couldn't start a new chat",
        "ave-reset-chat",
      );
    } catch {
      setIsResetting(false);
      return false;
    }
    return true;
  };

  return { reset, isResetting };
}

/**
 * Confirmation for "Start new chat" in Manager Ave's header menu.
 *
 * Lives outside the dropdown because a dialog rendered inside
 * `DropdownMenuContent` unmounts the moment the menu closes; the host owns the
 * open flag and renders this as a sibling.
 *
 * The reset swaps the master session underneath the caller, so this component
 * is unmounted by its own success. `isResetting` is cleared on the failure path
 * only — on success the surrounding shell has already been replaced.
 */
export function AveResetChatDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { reset, isResetting } = useResetOrchestratorChat();

  const handleConfirm = async () => {
    const ok = await reset();
    if (ok) onOpenChange(false);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start a new chat?"
      description="Manager Ave forgets this conversation and starts from scratch, on a fresh sandbox."
      detail="The current chat is archived, not deleted — you can still open it from your archived sessions. Agents Ave was watching stop reporting back to it."
      confirmLabel="Start new chat"
      variant="destructive"
      onConfirm={() => {
        void handleConfirm();
      }}
      isLoading={isResetting}
    />
  );
}
