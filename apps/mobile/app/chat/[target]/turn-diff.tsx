import { api } from "@eva/backend";
import { TURN_DIFF_TITLE, turnDiffRange } from "@eva/shared/turnCheckpoint";
import { IconAlertTriangle } from "@tabler/icons-react-native";
import { RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { CenteredSpinner, EmptyState } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { DiffOptions } from "@/diff/DiffOptions";
import { PrDiffGate, PrFileDiff } from "@/diff/PrFileDiff";
import { usePrDiff, type CompareRef } from "@/diff/prDiffStore";
import { ReviewCode } from "@/reviews/ReviewCode";

/**
 * The web "Diff this turn" (`TurnDiffDialog`) on its own screen, opened from
 * a reply's Changes chip: everything the agent committed between the turn's
 * checkpoints (`github.getCompareDiff`). Without `path` it is the changed
 * files, as a pull request's Code tab; a tap pushes the same screen on that
 * file, so Back returns to the list, and the bar there steps through the
 * files. Read only: a turn has no review to comment on.
 */
export default function TurnDiffScreen() {
  const params = useLocalSearchParams<{ target: string; repoId: string; base: string; head: string; path?: string }>();
  const router = useRouter();
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === params.repoId);
  const ref: CompareRef | null =
    repo !== undefined && params.base && params.head
      ? { repoId: repo._id, base: params.base, head: params.head, repoUrl: `https://github.com/${repo.owner}/${repo.name}` }
      : null;
  const { state, reload } = usePrDiff(ref);
  const header = (
    <RouterStackPageHeader
      title={TURN_DIFF_TITLE}
      description={params.base && params.head ? turnDiffRange({ beforeSha: params.base, afterSha: params.head }) : undefined}
      fallbackHref={{ pathname: "/chat/[target]", params: { target: params.target } }}
      headerRight={ref === null ? undefined : <DiffOptions pr={ref} refreshing={state.status === "ready" && state.refreshing} onRefresh={reload} />}
    />
  );

  if (ref === null) {
    return (
      <View className="flex-1">
        {header}
        {repos === undefined ? (
          <CenteredSpinner label="Loading changes…" />
        ) : (
          <EmptyState icon={IconAlertTriangle} title="Changes not found" description="The repository was removed, or you no longer have access." />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1">
      {header}
      {params.path === undefined ? (
        <ReviewCode
          pr={ref}
          state={state}
          onOpenFile={(path) =>
            router.push({
              pathname: "/chat/[target]/turn-diff",
              params: { target: params.target, repoId: ref.repoId, base: ref.base, head: ref.head, path },
            })
          }
        />
      ) : (
        <PrDiffGate state={state}>
          {(diff) => <PrFileDiff pr={ref} diff={diff} path={params.path} onPathChange={(path) => router.setParams({ path })} commentable={false} />}
        </PrDiffGate>
      )}
    </View>
  );
}
