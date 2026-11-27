import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import { toast } from "@vvedantb/ui";
import type { PrCloseTarget } from "./prCloseRequest";

/**
 * Closes a pull request on GitHub without merging it. Shared by the review
 * header and every PR menu, so the wording and failure handling match.
 */
export function useClosePullRequest() {
  const update = useAction(api.github.updatePullRequest);
  const [closing, setClosing] = useState(false);

  const close = async (target: PrCloseTarget): Promise<boolean> => {
    setClosing(true);
    let closed = false;
    // No `finally` and no value blocks in the try: React Compiler bails on both.
    try {
      await update({
        repoId: target.repoId,
        prNumber: target.prNumber,
        state: "closed",
      });
      toast.success(`Pull request #${target.prNumber} closed`);
      closed = true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not close the branch",
      );
    }
    setClosing(false);
    return closed;
  };

  return { close, closing };
}
