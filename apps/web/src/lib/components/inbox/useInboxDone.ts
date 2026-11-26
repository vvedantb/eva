"use client";

import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import { toast } from "@vvedantb/ui";
import { inboxDoneTarget } from "@eva/shared/inbox";
import { catchMutationError } from "@/lib/utils/mutationToast";

export type InboxRow = FunctionReturnType<typeof api.inbox.list>[number];
export type InboxListArgs = FunctionArgs<typeof api.inbox.list>;

/** Drops the rows `keep` rejects from the Inbox list on screen. */
function patchRows(
  localStore: OptimisticLocalStore,
  listArgs: InboxListArgs,
  keep: (row: InboxRow) => boolean,
): void {
  patchLoadedQuery(localStore, api.inbox.list, listArgs, (rows) =>
    rows.filter(keep),
  );
}

/**
 * Done (E) for one row, with a "Done · Undo" toast. A chat leaves until
 * something newer happens in it (`inbox.markDone`); a notification is
 * archived. The row leaves at once (optimistic), so the toast fires with it.
 * Returns undefined for a row Done cannot act on.
 */
export function useInboxDone(listArgs: InboxListArgs) {
  const markDone = useMutation(api.inbox.markDone).withOptimisticUpdate(
    (localStore, args) =>
      patchRows(localStore, listArgs, (row) => row.doneChatId !== args.chatId),
  );
  const undoDone = useMutation(api.inbox.undoDone);
  const archiveMany = useMutation(
    api.notifications.archiveMany,
  ).withOptimisticUpdate((localStore, args) => {
    const ids = new Set<string>(args.ids);
    patchRows(
      localStore,
      listArgs,
      (row) => row.notificationId === undefined || !ids.has(row.notificationId),
    );
  });
  const unarchiveMany = useMutation(api.notifications.unarchiveMany);

  return (row: InboxRow): void => {
    const target = inboxDoneTarget(row);
    if (!target) return;
    if (target.kind === "chat") {
      const { chatId, notificationId } = target;
      const done = catchMutationError(
        markDone({ chatId, notificationId }),
        "Couldn't mark as done",
        "inbox-done",
      );
      toast.success("Done", {
        action: {
          label: "Undo",
          onClick: () =>
            void done.then((undo) =>
              catchMutationError(
                undoDone({ chatId, ...undo }),
                "Couldn't undo",
                "inbox-undo",
              ),
            ),
        },
      });
      return;
    }
    const ids = [target.notificationId];
    void catchMutationError(archiveMany({ ids }), "Couldn't mark as done", "inbox-done");
    toast.success("Done", {
      action: {
        label: "Undo",
        onClick: () =>
          void catchMutationError(unarchiveMany({ ids }), "Couldn't undo", "inbox-undo"),
      },
    });
  };
}
