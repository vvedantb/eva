"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api, type Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  Textarea,
  toast,
} from "@eva/ui";
import { verdictSuccessTitle } from "./prVerdict";
import { convexErrorMessage } from "@/lib/utils/convexErrorMessage";

export type PrVerdict = "APPROVE" | "REQUEST_CHANGES";

/**
 * Approve, or ask for changes, without an inline comment to hang it on. The
 * Diffs toolbar's "Review changes" popover already does this *with* pending line
 * comments; a reviewer who has read the description and wants to sign off should
 * not have to open a diff to say so.
 *
 * GitHub requires a body on a changes-requested review and ignores an empty one
 * on an approval, so the field is required for one and optional for the other
 * rather than uniformly demanded.
 *
 * eva posts as its GitHub App, and GitHub refuses to let an app approve a pull
 * request the same app opened. That rejection is shown verbatim instead of being
 * guessed at up front — the alternative is hiding the control on the pull
 * requests where the reader most often wants it and is allowed to use it.
 */
export function PrVerdictDialog({
  repoId,
  prNumber,
  verdict,
  onClose,
  onSubmitted,
}: {
  repoId: Id<"githubRepos">;
  prNumber: number;
  /** Null while closed — the dialog is mounted by whatever opened it. */
  verdict: PrVerdict | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const submit = useAction(api.github.submitPrReview);
  const [body, setBody] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approving = verdict === "APPROVE";
  const trimmed = body.trim();
  const canSubmit = approving || trimmed.length > 0;

  const run = async () => {
    if (verdict === null) return;
    setWorking(true);
    setError(null);
    try {
      const result = await submit({
        repoId,
        prNumber,
        event: verdict,
        body: trimmed,
        comments: [],
      });
      toast.success(verdictSuccessTitle(result.state), {
        description: "Posted to GitHub as the eva app.",
      });
      setBody("");
      onSubmitted();
      onClose();
    } catch (cause) {
      setError(convexErrorMessage(cause, "GitHub rejected the review."));
    }
    setWorking(false);
  };

  return (
    <Dialog open={verdict !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {approving ? "Approve this pull request?" : "Request changes"}
          </DialogTitle>
          <DialogDescription>
            {approving
              ? "Posted to GitHub as the eva app. A summary is optional."
              : "GitHub requires a summary saying what has to change."}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={approving ? "Optional summary…" : "What has to change?"}
          aria-label="Review summary"
          className="min-h-24 text-sm"
        />

        {error === null ? null : (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button onClick={() => void run()} disabled={working || !canSubmit}>
            {working ? <Spinner size="sm" /> : null}
            {approving ? "Approve" : "Request changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
