import { api, type Id } from "@eva/backend";
import {
  MERGE_METHODS,
  canMergePr,
  mergeBlocker,
  mergeButtonLabel,
  stackMergeTargets,
  type MergeMethod,
  type PrOverview,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconGitMerge } from "@tabler/icons-react-native";
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
import { useScheme } from "@/ui/theme";

/**
 * The web header's Merge (`PrPrimaryAction` on an open pull request): one
 * button that GitHub's verdict enables, and the web confirmation, here a
 * bottom sheet that also holds the merge method (the web dropdown beside the
 * button; squash by default). Merging is irreversible, so nothing reaches
 * `github.mergePullRequest` without the confirm press, and a GitHub refusal
 * is shown as GitHub words it.
 */
export function MergeAction({
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
