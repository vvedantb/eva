import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconGitPullRequestClosed } from "@tabler/icons-react-native";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction } from "convex/react";
import { useState } from "react";
import { useScheme } from "@/ui/theme";

/** The pull request a close confirm is for. */
export type PrCloseTarget = { repoId: Id<"githubRepos">; prNumber: number };

/**
 * The web "Close without merging" confirm (`PrCloseDialog`): closing notifies
 * every reviewer and stops CI, so it asks first. `github.updatePullRequest`
 * closes it on GitHub; the dialog stays open, with a spinner, until that
 * returns, and a failure keeps it open with the error as a toast. Shared by
 * the PR screen's menu and a chat's pull requests sheet. `target` null = closed.
 */
export function PrCloseDialog({
  target,
  onOpenChange,
  onClosed,
}: {
  target: PrCloseTarget | null;
  onOpenChange: (open: boolean) => void;
  onClosed?: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const update = useAction(api.github.updatePullRequest);
  const [closing, setClosing] = useState(false);

  const close = () => {
    if (!target) return;
    setClosing(true);
    update({ repoId: target.repoId, prNumber: target.prNumber, state: "closed" }).then(
      () => {
        setClosing(false);
        onOpenChange(false);
        toast.success(`Pull request #${target.prNumber} closed`);
        onClosed?.();
      },
      (cause: Error) => {
        setClosing(false);
        toast.error(cause.message || "Could not close the branch");
      },
    );
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!closing) onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Close pull request #${target?.prNumber ?? ""} without merging?`}</DialogTitle>
          <DialogDescription>Reviewers are notified and CI stops. You can reopen it later.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={closing} onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={closing}
            disabled={closing}
            leftIcon={<IconGitPullRequestClosed size={16} color={theme.destructiveForeground} />}
            onPress={close}
          >
            {closing ? "Closing" : "Close pull request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
