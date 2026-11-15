import { api, type Id } from "@eva/backend";
import { mentionTokensToEditableText } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  buildRepliesByParentId,
  buildTaskTimeline,
  DELETED_COMMENT_PLACEHOLDER,
  describeTaskActivity,
  getUserDisplayName,
  groupReactions,
  isCommentDeleted,
  reactionTargetKey,
  toggleReaction,
  type ReactionGroup,
  type ReactionTargetType,
  type TaskComment,
  type TaskTimelineItem,
} from "@eva/shared/taskDetail";
import { IconDots } from "@tabler/icons-react-native";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Pressable, Text, View, type TextStyle } from "react-native";
import { UserMessageText } from "@/chat/MentionChip";
import { DeleteCommentDialog, ReactableMenu } from "@/quickTasks/TaskDiscussion";
import { TimeAgo } from "@/ui/TimeAgo";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { useScheme } from "@/ui/theme";

type User = FunctionReturnType<typeof api.users.listAll>[number];

const META = { fontSize: 12, lineHeight: 16 };

type ReactionsFor = ReturnType<typeof useTaskReactions>;

/**
 * Every reaction on the task, loaded once (the web `TaskReactionsProvider`):
 * call it with a target for its chips and a toggle, which shows at once.
 */
export function useTaskReactions(taskId: Id<"agentTasks">, users: User[] | undefined, currentUserId: Id<"users"> | null | undefined) {
  const reactions = useQuery(api.taskReactions.listByTask, { taskId });
  const toggleMutation = useMutation(api.taskReactions.toggle).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.taskReactions.listByTask, { taskId });
    if (!current || !currentUserId) return;
    store.setQuery(api.taskReactions.listByTask, { taskId }, toggleReaction(current, { ...args, userId: currentUserId }));
  });
  const groups = groupReactions(reactions, users, currentUserId);
  return (targetType: ReactionTargetType, targetId: string) => ({
    groups: groups.get(reactionTargetKey(targetType, targetId)) ?? [],
    toggle: (emoji: string) => {
      toggleMutation({ taskId, targetType, targetId, emoji }).catch(() => toast.error("Couldn't update the reaction"));
    },
  });
}

/**
 * The web task Activity (`ActivityTimeline`) in one column, oldest first:
 * who created the task, each field change and PR event on a shared rail, and
 * each top-level comment in its own card with its replies and reactions. The
 * order, wording and grouping come from `@eva/shared/taskDetail`, as on the
 * web. A tap on a reaction chip adds or removes yours; a comment's "…" opens
 * its menu (reactions, Reply, and Edit, Copy text and Delete on your own).
 */
export function TaskActivity({
  taskId,
  createdAt,
  creator,
  users,
  reactionsFor,
  isProjectTask,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
}: {
  taskId: Id<"agentTasks">;
  isProjectTask: boolean;
  createdAt: number;
  creator: User | undefined;
  users: User[] | undefined;
  reactionsFor: ReactionsFor;
  currentUserId: Id<"users"> | null | undefined;
  onReply: (comment: TaskComment) => void;
  onEdit: (comment: TaskComment) => void;
  onDelete: (id: Id<"taskComments">) => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const [menuFor, setMenuFor] = useState<TaskComment | null>(null);
  const [deleting, setDeleting] = useState<TaskComment | null>(null);
  const comments = useQuery(api.taskComments.listByTask, { taskId });
  const activity = useQuery(api.taskActivity.listByTask, { taskId });
  const userComments = comments?.filter((comment) => comment.authorId) ?? [];
  const replies = buildRepliesByParentId(userComments);
  const segments = buildTaskTimeline({ createdAt, activity, comments: userComments });

  const renderComment = (comment: TaskComment, depth: number) => {
    const reaction = reactionsFor("comment", comment._id);
    return (
      <View key={comment._id} className="gap-2">
        <CommentBody comment={comment} users={users} onMenu={isCommentDeleted(comment) ? undefined : () => setMenuFor(comment)} />
        {reaction.groups.length > 0 ? <ReactionChips groups={reaction.groups} onToggle={reaction.toggle} /> : null}
        {(replies.get(comment._id) ?? []).length > 0 ? (
          // Replies indent under their parent with a hairline, as the web thread.
          <View className="gap-3 pl-3" style={{ borderLeftWidth: 1, borderLeftColor: theme.border, marginLeft: depth === 0 ? 4 : 0 }}>
            {(replies.get(comment._id) ?? []).map((reply) => renderComment(reply, depth + 1))}
          </View>
        ) : null}
      </View>
    );
  };

  const menuReactions = menuFor ? reactionsFor("comment", menuFor._id) : undefined;
  const ownComment = menuFor !== null && menuFor.authorId === currentUserId;
  return (
    <View className="gap-3">
      {menuFor && menuReactions ? (
        <ReactableMenu
          open
          onOpenChange={(open) => {
            if (!open) setMenuFor(null);
          }}
          title="Comment"
          groups={menuReactions.groups}
          onToggleReaction={menuReactions.toggle}
          onReply={() => onReply(menuFor)}
          onEdit={ownComment ? () => onEdit(menuFor) : undefined}
          copyText={mentionTokensToEditableText(menuFor.content)}
          onDelete={ownComment ? () => setDeleting(menuFor) : undefined}
        />
      ) : null}
      <DeleteCommentDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        onConfirm={() => {
          if (deleting) onDelete(deleting._id);
        }}
      />
      {segments.map((segment) =>
        segment.kind === "comment" ? (
          <View
            key={`comment-${segment.item.comment._id}`}
            className="rounded-xl border px-3.5 py-3"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}
          >
            {renderComment(segment.item.comment, 0)}
          </View>
        ) : (
          <View
            key={`rail-${segment.items.map((item) => (item.kind === "taskActivity" ? item.activity._id : "created")).join("-")}`}
            className="gap-1 pl-3.5"
          >
            {segment.items.map((item) => (
              <RailRow key={item.kind === "taskActivity" ? item.activity._id : "created"} item={item} creator={creator} users={users} isProjectTask={isProjectTask} />
            ))}
          </View>
        ),
      )}
    </View>
  );
}

/** One rail event: the actor's initials (or a dot), the sentence, and how long ago. */
function RailRow({
  item,
  creator,
  users,
  isProjectTask,
}: {
  isProjectTask: boolean;
  item: Exclude<TaskTimelineItem, { kind: "comment" }>;
  creator: User | undefined;
  users: User[] | undefined;
}) {
  const theme = EVA_THEME[useScheme()];
  const muted = theme.mutedForeground;
  const strong: TextStyle = { color: theme.foreground, fontWeight: "500" };
  const value: TextStyle = { color: withAlpha(theme.foreground, 0.8), fontWeight: "500" };
  const dot = <View className="size-1.5 rounded-full" style={{ backgroundColor: theme.border }} />;

  let avatar = dot;
  let sentence;
  if (item.kind === "created") {
    if (creator) avatar = <InitialsAvatar user={creator} size={16} />;
    sentence = (
      <>
        <Text style={strong}>{creator ? getUserDisplayName(creator) : "Someone"}</Text>
        {isProjectTask ? " created the task" : " created the quick task"}
      </>
    );
  } else {
    const description = describeTaskActivity(item.activity, users);
    if (description.kind === "pr") {
      sentence = (
        <>
          <Text style={strong}>GitHub</Text>
          {description.merged ? " merged the PR — task moved to " : " closed the PR — task moved to "}
          <Text style={value}>{description.movedTo}</Text>
        </>
      );
    } else {
      if (description.actor) avatar = <InitialsAvatar user={description.actor} size={16} />;
      sentence = (
        <>
          <Text style={strong}>{description.actorName}</Text>
          {" changed "}
          <Text style={{ fontWeight: "500" }}>{description.fieldLabel}</Text>
          {description.values ? (
            <>
              {" from "}
              <Text style={value}>{description.values.from}</Text>
              {" → "}
              <Text style={value}>{description.values.to}</Text>
            </>
          ) : null}
        </>
      );
    }
  }
  return (
    <View className="min-h-7 flex-row items-center gap-2">
      <View className="size-4 items-center justify-center">{avatar}</View>
      <Text className="font-instrument-sans min-w-0 flex-1" style={{ ...META, color: muted }}>
        {sentence}
        <Text style={{ color: withAlpha(muted, 0.7) }}>{" · "}</Text>
        <TimeAgo at={item.timestamp} style={{ color: withAlpha(muted, 0.7) }} />
      </Text>
    </View>
  );
}

/**
 * A comment's author, age and text; a deleted one reads the web placeholder.
 * Its "…" (or a long press) opens the comment menu.
 */
function CommentBody({ comment, users, onMenu }: { comment: TaskComment; users: User[] | undefined; onMenu: (() => void) | undefined }) {
  const theme = EVA_THEME[useScheme()];
  const author = users?.find((user) => user._id === comment.authorId);
  const deleted = isCommentDeleted(comment);
  return (
    <Pressable onLongPress={onMenu} disabled={!onMenu} className="gap-1.5">
      <View className="flex-row items-center gap-2">
        {author ? <InitialsAvatar user={author} size={20} /> : null}
        <Text numberOfLines={1} className="font-instrument-sans-medium min-w-0 shrink text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
          {author ? getUserDisplayName(author) : "Someone"}
        </Text>
        <TimeAgo at={comment.createdAt} className="font-instrument-sans min-w-0 flex-1" style={{ ...META, color: withAlpha(theme.mutedForeground, 0.7) }} />
        {onMenu ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Comment actions"
            onPress={onMenu}
            hitSlop={6}
            className="-my-2 size-8 items-center justify-center rounded-lg active:opacity-70"
          >
            <IconDots size={16} color={theme.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {deleted ? (
        <Text className="font-instrument-sans text-sm italic" style={{ color: theme.mutedForeground }}>
          {DELETED_COMMENT_PLACEHOLDER}
        </Text>
      ) : (
        <UserMessageText content={comment.content} />
      )}
    </Pressable>
  );
}

/** The web `ReactionBar`: a chip per emoji with its count, tinted when you reacted; a tap toggles yours. */
export function ReactionChips({ groups, onToggle }: { groups: ReactionGroup[]; onToggle: (emoji: string) => void }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {groups.map((group) => (
        <Pressable
          key={group.emoji}
          accessibilityRole="button"
          accessibilityLabel={`${group.emoji} ${group.count}: ${group.reactors.map((reactor) => reactor.name).join(", ")}`}
          accessibilityState={{ selected: group.reactedByMe }}
          onPress={() => onToggle(group.emoji)}
          hitSlop={{ top: 6, bottom: 6 }}
          className="h-8 flex-row items-center gap-1 rounded-full border px-2.5 active:opacity-70"
          style={{
            backgroundColor: group.reactedByMe ? withAlpha(theme.primary, 0.12) : theme.secondary,
            borderColor: group.reactedByMe ? withAlpha(theme.primary, 0.4) : theme.border,
          }}
        >
          <Text style={{ fontSize: 14 }}>{group.emoji}</Text>
          <Text
            className="font-instrument-sans-medium"
            style={{ ...META, fontWeight: "500", color: group.reactedByMe ? theme.primary : theme.mutedForeground, fontVariant: ["tabular-nums"] }}
          >
            {group.count}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
