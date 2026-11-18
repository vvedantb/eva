import { api, type Id } from "@eva/backend";
import { docCommentThreads } from "@eva/shared/docComments";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconMessage } from "@tabler/icons-react-native";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * The doc screen's Comments button, beside its Options: a speech bubble, and
 * the open thread count when there is one. It opens the comments screen.
 */
export function DocCommentsButton({ docId, repoId }: { docId: Id<"docs">; repoId: Id<"githubRepos"> }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  const router = useRouter();
  const comments = useQuery(api.docComments.listByDoc, { docId });
  const openCount = comments ? docCommentThreads(comments).open.length : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={openCount > 0 ? `Comments, ${openCount} open` : "Comments"}
      onPress={() => router.push({ pathname: "/doc/comments", params: { docId, repo: repoId } })}
      className="h-11 min-w-11 flex-row items-center justify-center gap-1 rounded-lg px-2 active:opacity-70"
    >
      <IconMessage size={16} color={muted} />
      {openCount > 0 ? (
        <Text className="font-instrument-sans-medium text-xs" style={{ color: muted, fontWeight: "500", fontVariant: ["tabular-nums"] }}>
          {openCount}
        </Text>
      ) : null}
    </Pressable>
  );
}
