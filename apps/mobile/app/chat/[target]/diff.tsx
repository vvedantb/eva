import { api } from "@eva/backend";
import { prNumberFromGithubUrl } from "@eva/shared";
import { IconAlertTriangle, IconGitPullRequest } from "@tabler/icons-react-native";
import { RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { CenteredSpinner, EmptyState } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { DiffOptions } from "@/diff/DiffOptions";
import { PrDiffGate, PrFileDiff } from "@/diff/PrFileDiff";
import { usePrDiff } from "@/diff/prDiffStore";

/**
 * The web Review pane's Code tab for one file: the chat's pull request diff
 * (`github.getPrDiff`, what is pushed to GitHub, so a sleeping sandbox does
 * not matter), opened at the file a "Changed files" row named, or the first
 * file, drawn by `PrFileDiff` as the review Code tab draws it, Viewed ticks
 * included. Line comments stay on the review screen, whose composer posts
 * them. The header's ⋯ has the diff options. Before a PR is open, the web
 * "No pull request yet" state.
 */
export default function DiffScreen() {
  const { target, file } = useLocalSearchParams<{ target: string; file?: string }>();
  const router = useRouter();
  const chat = useQuery(api.mobile.getChat, { target });
  const prNumber = chat?.prUrl === undefined ? undefined : prNumberFromGithubUrl(chat.prUrl);
  const pr = chat?.repoId === undefined || prNumber === undefined ? null : { repoId: chat.repoId, prNumber };
  const { state, reload } = usePrDiff(pr);

  // After a deep link, Back opens the chat the diff belongs to.
  const fallbackHref: Href = { pathname: "/chat/[target]", params: { target } };

  if (pr === null) {
    return (
      <View className="flex-1">
        <RouterStackPageHeader title="Diff" fallbackHref={fallbackHref} />
        {chat === undefined ? (
          <CenteredSpinner label="Loading chat" />
        ) : chat === null ? (
          <EmptyState icon={IconAlertTriangle} title="Chat not found" description="It was deleted, or you no longer have access." />
        ) : (
          <EmptyState
            icon={IconGitPullRequest}
            title="No pull request yet"
            description="Once a pull request is opened for this work, its diff will appear here."
          />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <RouterStackPageHeader
        title="Diff"
        fallbackHref={fallbackHref}
        headerRight={<DiffOptions pr={pr} refreshing={state.status === "ready" && state.refreshing} onRefresh={reload} />}
      />
      <PrDiffGate state={state}>
        {(diff) => (
          <PrFileDiff pr={pr} diff={diff} path={file} onPathChange={(path) => router.setParams({ file: path })} commentable={false} />
        )}
      </PrDiffGate>
    </View>
  );
}
