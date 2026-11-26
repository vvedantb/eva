import { api } from "@eva/backend";
import { IconAlertTriangle } from "@tabler/icons-react-native";
import { RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { CenteredSpinner, EmptyState } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { DiffOptions } from "@/diff/DiffOptions";
import { PrDiffGate, PrFileDiff } from "@/diff/PrFileDiff";
import { usePrDiff } from "@/diff/prDiffStore";

/**
 * One file of a pull request's Code tab, pushed from its row, so Back returns
 * to the file list. The diff is the one the list read (`usePrDiff` shares
 * it); the bar at the bottom steps through the files in place. A tap on a
 * line drafts a review comment, posted with the review screen's composer.
 */
export default function ReviewFileScreen() {
  const params = useLocalSearchParams<{ repoId: string; prNumber: string; path?: string }>();
  const router = useRouter();
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === params.repoId);
  const prNumber = Number(params.prNumber);
  const pr = repo !== undefined && Number.isInteger(prNumber) && prNumber > 0 ? { repoId: repo._id, prNumber } : null;
  const { state, reload } = usePrDiff(pr);
  // After a deep link, Back opens the pull request on its Code tab.
  const header = (
    <RouterStackPageHeader
      title="Code"
      fallbackHref={{ pathname: "/review/[repoId]/[prNumber]", params: { repoId: params.repoId, prNumber: params.prNumber, tab: "code" } }}
      headerRight={
        pr === null ? undefined : <DiffOptions pr={pr} refreshing={state.status === "ready" && state.refreshing} onRefresh={reload} />
      }
    />
  );

  if (pr === null) {
    return (
      <View className="flex-1">
        {header}
        {repos === undefined ? (
          <CenteredSpinner label="Loading pull request…" />
        ) : (
          <EmptyState icon={IconAlertTriangle} title="Pull request not found" description="It was deleted, or you no longer have access." />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1">
      {header}
      <PrDiffGate state={state}>
        {(diff) => <PrFileDiff pr={pr} diff={diff} path={params.path} onPathChange={(path) => router.setParams({ path })} commentable />}
      </PrDiffGate>
    </View>
  );
}
