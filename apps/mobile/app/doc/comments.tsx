import { api } from "@eva/backend";
import { DOC_COMMENT_ERRORS, docCommentThreads, type DocCommentFilter } from "@eva/shared/docComments";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { getUserDisplayName } from "@eva/shared/taskDetail";
import { IconArrowBackUp, IconCheck, IconMessage } from "@tabler/icons-react-native";
import { goBackOrReplace, RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { Button, CenteredSpinner, EmptyState, Textarea } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { TimeAgo } from "@/ui/TimeAgo";
import { SegmentedTabs } from "@/ui/SegmentedTabs";
import { useScheme } from "@/ui/theme";

type DocComment = FunctionReturnType<typeof api.docComments.listByDoc>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

/**
 * A document's comments (the web `DocCommentsPanel`), opened from the doc's
 * Comments button: Open and Resolved threads, each with the text it is about,
 * its comments and replies, Resolve or Reopen, and Reply. A new thread starts
 * from a text selection, which stays on the web (user choice). Routes as
 * `/doc/comments?docId=<id>&repo=<repoId>`, so Back returns to the doc.
 */
export default function DocCommentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ docId: string; repo?: string }>();
  const [filter, setFilter] = useState<DocCommentFilter>("open");
  // The repo and the doc resolve through the lists that hold them, so their ids keep their table types.
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === params.repo);
  const docs = useQuery(api.docs.list, repo ? { repoId: repo._id } : "skip");
  const doc = docs?.find((candidate) => candidate._id === params.docId);
  const comments = useQuery(api.docComments.listByDoc, doc ? { docId: doc._id } : "skip");
  const users = useQuery(api.users.listAll, {});
  const header = (
    <RouterStackPageHeader
      title="Comments"
      fallbackHref={{ pathname: "/doc/[docId]", params: { docId: params.docId, repo: params.repo ?? "" } }}
    />
  );

  if (comments === undefined || !doc) {
    return (
      <View className="flex-1">
        {header}
        {(repos !== undefined && !repo) || (docs !== undefined && !doc) ? (
          <EmptyState icon={IconMessage} title="Document not found" description="It was deleted, or you no longer have access." />
        ) : (
          <CenteredSpinner label="Loading comments" />
        )}
      </View>
    );
  }

  const { open, resolved, repliesByParent } = docCommentThreads(comments);
  const threads = filter === "open" ? open : resolved;
  return (
    <View className="flex-1">
      {header}
      <View className="px-4 pb-2">
        <SegmentedTabs
          value={filter}
          options={[
            { value: "open", label: `Open (${open.length})` },
            { value: "resolved", label: `Resolved (${resolved.length})` },
          ]}
          onChange={setFilter}
        />
      </View>
      {threads.length === 0 ? (
        <EmptyState icon={IconMessage} title={filter === "open" ? "No open comments" : "No resolved comments"} />
      ) : (
        <KeyboardAwareScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          bottomOffset={16}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
        >
          {threads.map((root) => (
            <Thread key={root._id} root={root} replies={repliesByParent.get(root._id) ?? []} users={users} />
          ))}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

/** One thread: the quoted text, "For Eva" while it waits on the agent, the comments, then its actions. */
function Thread({ root, replies, users }: { root: DocComment; replies: DocComment[]; users: User[] | undefined }) {
  const theme = EVA_THEME[useScheme()];
  const setResolved = useMutation(api.docComments.setResolved);
  const create = useMutation(api.docComments.create);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const isResolved = root.resolvedAt !== undefined;

  const send = () => {
    const content = reply.trim();
    if (!content) return;
    create({ docId: root.docId, content, parentId: root._id }).then(
      () => {
        setReply("");
        setReplying(false);
      },
      () => toast.error(DOC_COMMENT_ERRORS.reply),
    );
  };

  return (
    <View className="gap-2 rounded-xl border p-3" style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      {root.anchorText ? (
        <View className="rounded-md px-2 py-1" style={{ backgroundColor: theme.muted }}>
          <Text numberOfLines={2} className="font-instrument-sans text-xs italic" style={{ color: theme.mutedForeground }}>
            {`“${root.anchorText}”`}
          </Text>
        </View>
      ) : null}
      {root.resolutionTarget === "agent" && !isResolved ? (
        <Text className="font-instrument-sans-medium self-start rounded px-1.5 py-0.5 text-xs" style={{ color: theme.primary, backgroundColor: theme.muted, fontWeight: "500" }}>
          For Eva
        </Text>
      ) : null}
      <CommentItem comment={root} users={users} />
      {replies.map((entry) => (
        <View key={entry._id} className="ml-3 border-l-2 pl-2" style={{ borderColor: theme.border }}>
          <CommentItem comment={entry} users={users} />
        </View>
      ))}
      {replying ? (
        <View className="gap-2">
          <Textarea autoFocus value={reply} onChangeText={setReply} placeholder="Reply..." accessibilityLabel="Reply" />
          <View className="flex-row justify-end gap-2">
            <Button
              size="sm"
              fullWidth={false}
              variant="ghost"
              onPress={() => {
                setReplying(false);
                setReply("");
              }}
            >
              Cancel
            </Button>
            <Button size="sm" fullWidth={false} disabled={!reply.trim()} onPress={send}>
              Reply
            </Button>
          </View>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          <Button
            size="sm"
            fullWidth={false}
            variant="ghost"
            leftIcon={isResolved ? <IconArrowBackUp size={14} color={theme.foreground} /> : <IconCheck size={14} color={theme.foreground} />}
            onPress={() =>
              setResolved({ id: root._id, resolved: !isResolved }).catch(() =>
                toast.error(isResolved ? DOC_COMMENT_ERRORS.reopen : DOC_COMMENT_ERRORS.resolve),
              )
            }
          >
            {isResolved ? "Reopen" : "Resolve"}
          </Button>
          <Button size="sm" fullWidth={false} variant="ghost" onPress={() => setReplying(true)}>
            Reply
          </Button>
        </View>
      )}
    </View>
  );
}

/** One comment: the author's initials and name, when, and the text (italic once deleted). */
function CommentItem({ comment, users }: { comment: DocComment; users: User[] | undefined }) {
  const theme = EVA_THEME[useScheme()];
  const author = comment.authorId ? users?.find((user) => user._id === comment.authorId) : undefined;
  const deleted = comment.deletedAt !== undefined;
  return (
    <View className="gap-0.5">
      <View className="flex-row items-center gap-1.5">
        {author ? <InitialsAvatar user={author} size={16} /> : null}
        <Text numberOfLines={1} className="font-instrument-sans-medium shrink text-xs" style={{ color: theme.foreground, fontWeight: "500" }}>
          {author ? getUserDisplayName(author) : "Unknown"}
        </Text>
        <TimeAgo at={comment.createdAt} className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }} />
      </View>
      <Text className="font-instrument-sans text-sm" style={{ color: deleted ? theme.mutedForeground : theme.foreground, fontStyle: deleted ? "italic" : "normal" }}>
        {comment.content}
      </Text>
    </View>
  );
}
