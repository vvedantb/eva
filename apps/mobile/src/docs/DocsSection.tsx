import { api, type Id } from "@eva/backend";
import { chatSourceKindLabel, chatSourceShortLabel, type ChatSourceKind } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconCode,
  IconFile,
  IconLayoutKanban,
  IconMessage,
  IconTerminal2,
  IconTrash,
  type IconProps,
} from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { ConfirmDialog, EmptyState, ListDivider, SheetRow, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState, type ComponentType } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { META_TEXT } from "@/quickTasks/QuickTaskRow";
import { displayTitle, timeAgo } from "@/ui/format";
import { MenuDivider, MenuSheet } from "@/ui/MenuSheet";
import { RepoSection } from "@/ui/RepoPicker";
import { useScheme, XS_TRACKING } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

type DocRow = FunctionReturnType<typeof api.docs.list>[number];
type DocSource = NonNullable<DocRow["source"]>;

/** The web `ChatSourceBadge` icons, as the Sessions, Quick Tasks and Projects sections. */
const SOURCE_ICONS: Record<ChatSourceKind, ComponentType<IconProps>> = {
  session: IconTerminal2,
  task: IconCode,
  project: IconLayoutKanban,
};

/**
 * The web Documents list (`DocsSidebar`, the drawer's Documents panel) for
 * one repo: the repo's docs, PR recaps left out as the web (they live in
 * Reviews), newest first. A row is the web drawer row at a thumb's size:
 * 56 high, the 14 title, the source chat badge under it, the age at the
 * end. A tap opens the doc (`/doc/<id>`); a long press opens the web row
 * menu as a sheet (`useDocActions`). Not here from the web: New document,
 * Upload PRD and the hover preview.
 */
export function DocsSection() {
  return (
    <RepoSection icon={IconFile} placeholder={<DocPlaceholders />}>
      {(repo) => <DocList repoId={repo._id} />}
    </RepoSection>
  );
}

function DocList({ repoId }: { repoId: Id<"githubRepos"> }) {
  const docs = useQuery(api.docs.list, { repoId, excludeEvaRecaps: true });
  const actions = useDocActions();
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  if (docs === undefined) return <DocPlaceholders />;
  // PR recaps live under Reviews now — Documents is non-recap only (the web filter).
  const shown = docs.filter((doc) => doc.kind !== "pr-recap");
  if (shown.length === 0) {
    // The web panel's copy; documents are made on the web, so it says where.
    return <EmptyState icon={IconFile} title="No documents yet" description="Create one on the web. It shows up here." />;
  }
  return (
    <>
      <FlatList
        {...LIST_WINDOW}
        data={shown}
        keyExtractor={(doc) => doc._id}
        ItemSeparatorComponent={ListDivider}
        renderItem={({ item: doc }) => <DocListRow doc={doc} repoId={repoId} onLongPress={() => actions.openSheet(doc)} />}
        contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) }}
      />
      {actions.dialogs}
    </>
  );
}

function DocListRow({ doc, repoId, onLongPress }: { doc: DocRow; repoId: Id<"githubRepos">; onLongPress: () => void }) {
  const router = useRouter();
  const theme = EVA_THEME[useScheme()];
  const title = displayTitle(doc.title);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => router.push({ pathname: "/doc/[docId]", params: { docId: doc._id, repo: repoId } })}
      onLongPress={onLongPress}
      accessibilityActions={[{ name: "longpress", label: "Document actions" }]}
      onAccessibilityAction={onLongPress}
      className="min-h-14 flex-row items-center gap-3 px-4 py-2 active:opacity-70"
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text numberOfLines={1} className="font-instrument-sans text-sm" style={{ color: theme.foreground }}>
          {title}
        </Text>
        {doc.source ? <ChatSourceBadge source={doc.source} /> : null}
      </View>
      <Text
        className="font-instrument-sans text-xs"
        style={{ color: theme.mutedForeground, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
      >
        {timeAgo(doc.updatedAt)}
      </Text>
    </Pressable>
  );
}

/** The web `ChatSourceBadge`: the chat a doc was made in ("Session #12") on a muted pill, radius 6. */
function ChatSourceBadge({ source }: { source: DocSource }) {
  const theme = EVA_THEME[useScheme()];
  const Icon = SOURCE_ICONS[source.kind];
  return (
    <View className="flex-row items-center gap-1 self-start rounded-md px-1.5 py-0.5" style={{ backgroundColor: theme.muted }}>
      <Icon size={12} color={theme.mutedForeground} />
      <Text
        numberOfLines={1}
        className="font-instrument-sans-medium"
        style={{ ...META_TEXT, fontWeight: "500", color: theme.mutedForeground, fontVariant: ["tabular-nums"] }}
      >
        {chatSourceShortLabel(source)}
      </Text>
    </View>
  );
}

/** The doc fields the menu reads. */
type DocMenuTarget = Pick<DocRow, "_id" | "title" | "source">;

/**
 * The web Documents row menu as a bottom sheet (`openSheet`): "Open
 * session" (or task, or project: the phone chat of the doc's source) and
 * Delete, behind the web "Delete Document" confirm, then `docs.remove`
 * with the web toasts. Render `dialogs` once.
 */
function useDocActions() {
  const router = useRouter();
  const theme = EVA_THEME[useScheme()];
  const [target, setTarget] = useState<DocMenuTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocMenuTarget | null>(null);
  const removeDoc = useMutation(api.docs.remove);
  const source = target?.source;

  const dialogs = (
    <>
      <MenuSheet
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={displayTitle(target?.title ?? "")}
      >
        {source ? (
          <>
            <SheetRow
              icon={IconMessage}
              title={`Open ${chatSourceKindLabel(source.kind).toLowerCase()}`}
              onPress={() => {
                setTarget(null);
                router.push({ pathname: "/chat/[target]", params: { target: source.id } });
              }}
            />
            <MenuDivider />
          </>
        ) : null}
        <SheetRow
          icon={IconTrash}
          title="Delete"
          danger
          onPress={() => {
            setDeleteTarget(target);
            setTarget(null);
          }}
        />
      </MenuSheet>
      {/* The web "Delete Document" dialog. */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Document"
        description={
          <>
            Are you sure you want to delete{" "}
            <Text className="font-instrument-sans-semibold" style={{ fontWeight: "600", color: theme.foreground }}>
              {deleteTarget?.title}
            </Text>
            ?{"\n\nThis action cannot be undone. The document will be permanently deleted."}
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (!deleteTarget) return;
          removeDoc({ id: deleteTarget._id })
            .then(() => toast.success("Document deleted", { id: "doc-delete" }))
            .catch(() => toast.error("Couldn't delete document", { id: "doc-delete" }));
        }}
      />
    </>
  );

  return { openSheet: (doc: DocMenuTarget) => setTarget(doc), dialogs };
}

/** While the docs load: rows shaped as `DocListRow`. */
function DocPlaceholders() {
  return <SkeletonList label="Loading documents" count={8} renderRow={(row) => <SkeletonRow index={row} />} />;
}
