"use client";

import { PrCloseDialog } from "@/lib/components/reviews/_components/PrCloseDialog";
import { requestPrClose, usePrCloseRequest } from "./prCloseRequest";
import { useClosePullRequest } from "./useClosePullRequest";

/**
 * The one confirmation dialog behind "Close without merging" in every PR menu.
 * Mounted once at the root because a menu's content unmounts as soon as an
 * item is chosen.
 */
export function PrCloseDialogHost() {
  const target = usePrCloseRequest();
  const { close, closing } = useClosePullRequest();

  if (target === null) return null;
  return (
    <PrCloseDialog
      prNumber={target.prNumber}
      open
      onOpenChange={(open) => {
        if (!open && !closing) requestPrClose(null);
      }}
      onConfirm={() => {
        void close(target).then((closed) => {
          if (closed) requestPrClose(null);
        });
      }}
      closing={closing}
    />
  );
}
