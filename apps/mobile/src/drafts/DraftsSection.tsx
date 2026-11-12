import { api, type Id } from "@eva/backend";
import { draftContextTitle, draftKindLabel, draftSnippet, mergeDrafts, type DraftListItem } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconFileText, IconTrash } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { EmptyState, SheetRow, SkeletonList, SkeletonRow, SurfaceRow } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { META_TEXT } from "@/quickTasks/QuickTaskRow";
import { CardGap } from "@/ui/FoldHeader";
import { timeAgo } from "@/ui/format";
import { MenuSheet } from "@/ui/MenuSheet";
import { RepoSection } from "@/ui/RepoPicker";
import { useScheme, XS_TRACKING } from "@/ui/theme";

type CommentDraft = FunctionReturnType<typeof api.drafts.listForRepo>[number];
type TaskDraft = FunctionReturnType<typeof api.agentTasks.listDrafts>[number];
type Draft = DraftListItem<CommentDraft, TaskDraft>;

/**
 * The web Drafts page (`DraftsClient`) for one repo: the user's comment
 * drafts and quick-task drafts as one list, newest first
 * (`@eva/shared` `mergeDrafts`), as the web cards in one column. A tap
 * opens where the draft was written; a long press opens the web card menu
 * (Delete draft) as a sheet.
 */
export function DraftsSection() {
  return (
    <RepoSection icon={IconFileText} placeholder={<DraftPlaceholders />}>
      {(repo) => <DraftList repoId={repo._id} />}
    </RepoSection>
  );
}

function DraftList({ repoId }: { repoId: Id<"githubRepos"> }) {
  const commentDrafts = useQuery(api.drafts.listForRepo, { repoId });
  const taskDrafts = useQuery(api.agentTasks.listDrafts, { repoId });
  const [menuTarget, setMenuTarget] = useState<Draft | null>(null);
  const removeCommentDraft = useMutation(api.drafts.remove);
  const removeTaskDraft = useMutation(api.agentTasks.remove);
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();

  if (commentDrafts === undefined || taskDrafts === undefined) return <DraftPlaceholders />;
  const drafts = mergeDrafts(commentDrafts, taskDrafts);
  if (drafts.length === 0) {
    return (
      <EmptyState
        icon={IconFileText}
        title="No drafts"
        description="Drafts save automatically as you type comments, prompts, or compose quick tasks."
      />
    );
  }

  // The web `handleDelete`: no confirm, then the web toasts.
  const remove = (draft: Draft) => {
    setMenuTarget(null);
    const promise = draft.source === "comment" ? removeCommentDraft({ id: draft.row._id }) : removeTaskDraft({ id: draft.row._id });
    promise
      .then(() => toast.success("Draft deleted", { id: "draft-delete" }))
      .catch(() => toast.error("Couldn't delete draft", { id: "draft-delete" }));
  };

  return (
    <>
      <FlatList
        data={drafts}
        keyExtractor={(draft) => `${draft.source}-${draft.row._id}`}
        ItemSeparatorComponent={CardGap}
        renderItem={({ item: draft }) => <DraftCard draft={draft} repoId={repoId} onLongPress={() => setMenuTarget(draft)} />}
        // Web: the page's `comfortable` padding; the list's `px-3` as Projects.
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: tabBarReserve(largerText, insets.bottom) }}
      />
      <MenuSheet
        open={menuTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMenuTarget(null);
        }}
        title={menuTarget ? draftContextTitle(menuTarget) : ""}
      >
        <SheetRow
          icon={IconTrash}
          title="Delete draft"
          danger
          onPress={() => {
            if (menuTarget) remove(menuTarget);
          }}
        />
      </MenuSheet>
    </>
  );
}

/**
 * One web `DraftCard`: the kind badge and age, the 2-line title, then the
 * 3-line snippet (or "No content"). Sized for a thumb: a 14 title, 12 meta,
 * `p-4` as the web.
 */
function DraftCard({ draft, repoId, onLongPress }: { draft: Draft; repoId: Id<"githubRepos">; onLongPress: () => void }) {
  const theme = EVA_THEME[useScheme()];
  const open = useOpenDraft(repoId);
  const title = draftContextTitle(draft);
  const snippet = draftSnippet(draft);
  return (
    <SurfaceRow
      accessibilityLabel={title}
      backgroundColor={theme.card}
      className="gap-2 p-4"
      onPress={() => open(draft)}
      onLongPress={onLongPress}
      longPressLabel="Draft actions"
    >
      <View className="flex-row items-center gap-2">
        {/* The web `Badge variant="secondary"` on `bg-muted`, no border. */}
        <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: theme.muted }}>
          <Text className="font-instrument-sans-medium" style={{ ...META_TEXT, fontWeight: "500", color: theme.mutedForeground }}>
            {draftKindLabel(draft)}
          </Text>
        </View>
        <Text numberOfLines={1} className="font-instrument-sans min-w-0 flex-1 text-xs" style={{ color: theme.mutedForeground, letterSpacing: XS_TRACKING }}>
          {timeAgo(draft.row.updatedAt)}
        </Text>
      </View>
      <Text numberOfLines={2} className="font-instrument-sans-medium text-sm" style={{ fontWeight: "500", color: theme.foreground }}>
        {title}
      </Text>
      {snippet ? (
        <Text numberOfLines={3} className="font-instrument-sans text-sm" style={{ color: theme.mutedForeground }}>
          {snippet}
        </Text>
      ) : (
        <Text className="font-instrument-sans text-sm italic" style={{ color: theme.mutedForeground, opacity: 0.5 }}>
          No content
        </Text>
      )}
    </SurfaceRow>
  );
}

/**
 * Where a draft was written, as the web card's `handleClick`, on the phone's
 * screens: a quick-task draft opens the new quick task with it loaded; a
 * session chat draft opens that chat. A task comment opens
 * the task's chat: the phone has no task Activity page.
 */
function useOpenDraft(repoId: Id<"githubRepos">) {
  const router = useRouter();
  return (draft: Draft) => {
    if (draft.source === "task") {
      router.push({ pathname: "/quick-task/new", params: { repoId, draftId: draft.row._id } });
      return;
    }
    const { kind, taskId, sessionId } = draft.row;
    const target = kind === "taskComment" ? taskId : sessionId;
    if (target) router.push({ pathname: "/chat/[target]", params: { target } });
  };
}

/** While the drafts load: cards shaped as `DraftCard`, 8 apart, on the list's `px-3`. */
function DraftPlaceholders() {
  const card = EVA_THEME[useScheme()].card;
  return (
    <SkeletonList
      label="Loading drafts"
      divided={false}
      className="px-3"
      renderRow={(row) => (
        <View className="mb-2 rounded-lg" style={{ backgroundColor: card }}>
          <SkeletonRow index={row} lines={2} trailing={false} minHeight={112} className="px-4" />
        </View>
      )}
    />
  );
}
