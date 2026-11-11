import { api, type Id } from "@eva/backend";
import {
  MERGE_METHODS,
  canMergePr,
  mergeBlocker,
  mergeButtonLabel,
  revertSessionRequest,
  stackMergeTargets,
  type MergeMethod,
  type PrOverview,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconArrowBackUp, IconGitMerge, IconGitPullRequest } from "@tabler/icons-react-native";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SheetRow,
} from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction } from "convex/react";
import { useState } from "react";
import { Text, View } from "react-native";
import { useStartReviewSession } from "@/reviews/useStartReviewSession";
import { useScheme } from "@/ui/theme";

/**
 * The web header's one loud control (`PrPrimaryAction`), in the review
 * screen's bottom bar: whatever the pull request's state makes possible.
 * Open: Merge. Closed: Reopen (`github.updatePullRequest`, no confirm, as
 * the web). Merged: Revert, behind the web confirm, which starts a session
 * on the base branch that writes the revert.
 */
export function PrPrimaryAction({
  repoId,
  overview,
  onDone,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  onDone: () => void;
}) {
  if (overview.status === "merged") return <RevertAction repoId={repoId} overview={overview} />;
  if (overview.status === "closed") return <ReopenAction repoId={repoId} overview={overview} onDone={onDone} />;
  return <MergeAction repoId={repoId} overview={overview} onDone={onDone} />;
}

/**
 * The web header's Merge (`PrPrimaryAction` on an open pull request): one
 * button that GitHub's verdict enables, and the web confirmation, here a
 * bottom sheet that also holds the merge method (the web dropdown beside the
 * button; squash by default). Merging is irreversible, so nothing reaches
 * `github.mergePullRequest` without the confirm press, and a GitHub refusal
 * is shown as GitHub words it.
 */
function MergeAction({
  repoId,
  overview,
  onDone,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  onDone: () => void;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const mergePr = useAction(api.github.mergePullRequest);
  const [method, setMethod] = useState<MergeMethod>("squash");
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);
  const canMerge = canMergePr(overview);
  const blocked = mergeBlocker(overview)?.detail;
  const stackTargets = overview.stack ? stackMergeTargets(overview.stack) : [];
  const methodLabel = MERGE_METHODS.find((entry) => entry.value === method)?.label ?? "Merge";

  const runMerge = () => {
    if (merging) return;
    setMerging(true);
    mergePr({ repoId, prNumber: overview.number, method }).then(
      (result) => {
        setMerging(false);
        setConfirming(false);
        toast.success(result.message || "Pull request merged");
        onDone();
      },
      (cause: Error) => {
        setMerging(false);
        toast.error(cause.message || "Could not merge the branch");
      },
    );
  };

  return (
    <>
      <Button
        disabled={!canMerge}
        accessibilityHint={blocked}
        leftIcon={<IconGitMerge size={16} color={theme.primaryForeground} />}
        onPress={() => setConfirming(true)}
      >
        {mergeButtonLabel(overview)}
      </Button>
      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          // Closing mid-merge would hide the only progress the user sees.
          if (!merging) setConfirming(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`${methodLabel}?`}</DialogTitle>
            <DialogDescription>
              {stackTargets.length > 1 && overview.stack !== null
                ? `This merges ${stackTargets.length} stacked pull requests into ${overview.stack.baseRef} on GitHub, in this order. It cannot be undone from Eva.`
                : `This merges ${overview.headRef} into ${overview.baseRef} on GitHub. It cannot be undone from Eva.`}
            </DialogDescription>
          </DialogHeader>
          {stackTargets.length > 1 ? (
            <View className="gap-1 rounded-2xl px-3 py-2" style={{ backgroundColor: withAlpha(theme.muted, 0.5) }}>
              {stackTargets.map((entry) => (
                <View key={entry.number} className="flex-row gap-2">
                  <Text className="text-sm" style={{ color: theme.mutedForeground, fontVariant: ["tabular-nums"] }}>
                    {`#${entry.number}`}
                  </Text>
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-sm" style={{ color: theme.foreground }}>
                    {entry.title}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View accessibilityRole="radiogroup" accessibilityLabel="Merge method">
            {MERGE_METHODS.map((entry) => (
              <SheetRow
                key={entry.value}
                title={entry.label}
                active={entry.value === method}
                disabled={merging}
                onPress={() => setMethod(entry.value)}
              />
            ))}
          </View>
          <DialogFooter>
            <Button variant="ghost" disabled={merging} onPress={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button loading={merging} disabled={merging} onPress={runMerge}>
              {merging ? "Merging" : methodLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReopenAction({ repoId, overview, onDone }: { repoId: Id<"githubRepos">; overview: PrOverview; onDone: () => void }) {
  const theme = EVA_THEME[useScheme()];
  const update = useAction(api.github.updatePullRequest);
  const [working, setWorking] = useState(false);
  const reopen = () => {
    setWorking(true);
    update({ repoId, prNumber: overview.number, state: "open" }).then(
      () => {
        setWorking(false);
        toast.success("Pull request reopened");
        onDone();
      },
      (cause: Error) => {
        setWorking(false);
        toast.error(cause.message || "Could not reopen the branch");
      },
    );
  };
  return (
    <Button loading={working} disabled={working} leftIcon={<IconGitPullRequest size={16} color={theme.primaryForeground} />} onPress={reopen}>
      Reopen
    </Button>
  );
}

/**
 * Revert as work, not as an API call, as the web: GitHub has no "undo this
 * merge" call, so after the confirm this starts a session on the base branch
 * with the revert asked for (`revertSessionRequest`) and opens its chat.
 */
function RevertAction({ repoId, overview }: { repoId: Id<"githubRepos">; overview: PrOverview }) {
  const theme = EVA_THEME[useScheme()];
  const { start, starting } = useStartReviewSession(repoId);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button disabled={starting} leftIcon={<IconArrowBackUp size={16} color={theme.primaryForeground} />} onPress={() => setConfirming(true)}>
        Revert
      </Button>
      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!starting) setConfirming(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revert this pull request?</DialogTitle>
            <DialogDescription>
              {`A merge cannot be undone through GitHub, so this starts a session on ${overview.baseRef} that writes the revert and opens a pull request for it. Nothing changes until that pull request is merged.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={starting} onPress={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              loading={starting}
              disabled={starting}
              leftIcon={<IconArrowBackUp size={16} color={theme.primaryForeground} />}
              onPress={() => start(revertSessionRequest(overview), () => setConfirming(false))}
            >
              Start a session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
