"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { IconMessagePlus } from "@tabler/icons-react";
import { api } from "@eva/backend";
import { Tooltip, TooltipContent, TooltipTrigger } from "@eva/ui";
import { AVE_HEADER_BUTTON_CLASS } from "@/lib/components/ave/aveHeaderButton";
import { ConfirmDialog } from "@/lib/components/quick-tasks/_components/ConfirmDialog";
import { requestConfirm, useAltHeld } from "@/lib/confirm";
import { withMutationToast } from "@/lib/utils/mutationToast";

/** Resets Manager Ave. Shared by the confirm dialog and Alt-click bypass. */
function useResetAveChat() {
  const resetChat = useMutation(api.ave.reset);
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
    setIsResetting(false);
    return true;
  };

  return { reset, isResetting };
}

/**
 * "New chat" header button for Manager Ave, plus the confirmation it opens.
 * Used in the launcher popover's header and on the `/ave` page. Alt-click
 * skips the dialog, like the other confirmable header actions.
 */
export function AveNewChatButton() {
  const [open, setOpen] = useState(false);
  const altHeld = useAltHeld();
  const { reset, isResetting } = useResetAveChat();

  const handleConfirm = async () => {
    const ok = await reset();
    if (ok) setOpen(false);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(event) =>
              requestConfirm(
                altHeld,
                () => setOpen(true),
                () => {
                  void reset();
                },
                event,
              )
            }
            aria-label="New Manager Ave chat"
            className={AVE_HEADER_BUTTON_CLASS}
          >
            <IconMessagePlus size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">New chat</TooltipContent>
      </Tooltip>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Start a new chat?"
        description="Manager Ave starts a new conversation. Agents it was watching stop reporting back to it."
        confirmLabel="Start new chat"
        variant="destructive"
        onConfirm={() => {
          void handleConfirm();
        }}
        isLoading={isResetting}
      />
    </>
  );
}
