import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { mentionTokensToEditableText } from "@eva/shared";
import {
  DELETED_COMMENT_PLACEHOLDER,
  getUserDisplayName,
  QUICK_REACTIONS,
  type ReactionGroup,
  type TaskComment,
} from "@eva/shared/taskDetail";
import { IconArrowBackUp, IconBell, IconBellOff, IconClipboard, IconPencil, IconTrash, IconUserPlus } from "@tabler/icons-react-native";
import { ReplyQuoteChip } from "@vvedantb/native-ui/ai";
import { Button, ConfirmDialog, SheetRow } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FooterSheet } from "@/chat/ComposerFooter";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { MenuDivider, MenuSheet } from "@/ui/MenuSheet";
import { useScheme } from "@/ui/theme";

type User = FunctionReturnType<typeof api.users.listAll>[number];

/** What the comment box sends: a new comment, a reply to one, or an edit of yours. */
export type CommentMode = { kind: "new" } | { kind: "reply"; comment: TaskComment } | { kind: "edit"; comment: TaskComment };

/** Above the comment box while it replies or edits: the comment it is about, with an X that goes back to a new comment. */
export function CommentModeChip({ mode, users, onDismiss }: { mode: CommentMode; users: User[] | undefined; onDismiss: () => void }) {
  if (mode.kind === "new") return null;
  const author = users?.find((user) => user._id === mode.comment.authorId);
  const name = author ? getUserDisplayName(author) : "Someone";
  const text = mentionTokensToEditableText(mode.comment.content);
  return mode.kind === "reply" ? (
    <ReplyQuoteChip author={name} text={text} onDismiss={onDismiss} />
  ) : (
    <ReplyQuoteChip author="Editing comment" text={text} onDismiss={onDismiss} accessibilityLabel="Editing your comment" dismissLabel="Cancel edit" />
  );
}

/** The web quick reactions as one row of 44 targets; yours are tinted, and a tap toggles one. */
function QuickReactionRow({ groups, onToggle }: { groups: ReactionGroup[]; onToggle: (emoji: string) => void }) {
  const theme = EVA_THEME[useScheme()];
  const mine = new Set(groups.filter((group) => group.reactedByMe).map((group) => group.emoji));
  return (
    <View className="flex-row justify-between px-2 pb-2">
      {QUICK_REACTIONS.map((emoji) => (
        <Pressable
          key={emoji}
          accessibilityRole="button"
          accessibilityLabel={`${mine.has(emoji) ? "Remove" : "Add"} ${emoji} reaction`}
          accessibilityState={{ selected: mine.has(emoji) }}
          onPress={() => onToggle(emoji)}
          className="size-11 items-center justify-center rounded-full active:opacity-70"
          style={{ backgroundColor: mine.has(emoji) ? withAlpha(theme.primary, 0.12) : theme.secondary }}
        >
          <Text style={{ fontSize: 20 }}>{emoji}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * The web comment actions on the phone, from a comment's "…" or a long press:
 * the quick reactions, Reply, then Edit, Copy text and, for your own comment,
 * Delete (`onDelete` asks first: `DeleteCommentDialog`). The description gets
 * the reactions, Edit and Copy text.
 */
export function ReactableMenu({
  open,
  onOpenChange,
  title,
  groups,
  onToggleReaction,
  onReply,
  onEdit,
  copyText,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  groups: ReactionGroup[];
  onToggleReaction: (emoji: string) => void;
  onReply?: () => void;
  onEdit?: () => void;
  copyText?: string;
  onDelete?: () => void;
}) {
  const act = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  return (
    <>
      <MenuSheet open={open} onOpenChange={onOpenChange} title={title}>
        <QuickReactionRow
          groups={groups}
          onToggle={(emoji) => act(() => onToggleReaction(emoji))}
        />
        {onReply || onEdit || copyText !== undefined ? <MenuDivider /> : null}
        {onReply ? <SheetRow icon={IconArrowBackUp} title="Reply" onPress={() => act(onReply)} /> : null}
        {onEdit ? <SheetRow icon={IconPencil} title="Edit" onPress={() => act(onEdit)} /> : null}
        {copyText !== undefined ? (
          <SheetRow
            icon={IconClipboard}
            title="Copy text"
            onPress={() =>
              act(() => {
                void Clipboard.setStringAsync(copyText);
              })
            }
          />
        ) : null}
        {onDelete ? (
          <>
            <MenuDivider />
            <SheetRow icon={IconTrash} title="Delete" danger onPress={() => act(onDelete)} />
          </>
        ) : null}
      </MenuSheet>
    </>
  );
}

/** The web delete dialog for a comment. */
export function DeleteCommentDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Comment"
      description="Are you sure you want to delete this comment? This action cannot be undone."
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={onConfirm}
    />
  );
}

/** Comment writes that show at once: delete leaves the web placeholder, edit swaps the text. */
export function useCommentMutations(taskId: Id<"agentTasks">) {
  const remove = useMutation(api.taskComments.remove).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.taskComments.listByTask, { taskId });
    if (!current) return;
    store.setQuery(
      api.taskComments.listByTask,
      { taskId },
      current.map((entry) => (entry._id === args.id ? { ...entry, deletedAt: Date.now(), content: DELETED_COMMENT_PLACEHOLDER } : entry)),
    );
  });
  const update = useMutation(api.taskComments.update).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.taskComments.listByTask, { taskId });
    if (!current) return;
    store.setQuery(
      api.taskComments.listByTask,
      { taskId },
      current.map((entry) => (entry._id === args.id ? { ...entry, content: args.content } : entry)),
    );
  });
  const create = useMutation(api.taskComments.create);
  return {
    remove: (id: Id<"taskComments">) => {
      remove({ id }).catch(() => toast.error("Could not delete the comment. Try again."));
    },
    update,
    create,
  };
}

/**
 * The web `TaskSubscribers`: Subscribe / Subscribed for you, the subscribers'
 * initials, and a + that opens "Manage subscribers" (everyone in the
 * workspace, each a toggle). Subscribers hear about comments, status changes
 * and PR events.
 */
export function TaskSubscribers({ taskId, users }: { taskId: Id<"agentTasks">; users: User[] | undefined }) {
  const theme = EVA_THEME[useScheme()];
  const currentUserId = useQuery(api.auth.me, {});
  const subscribers = useQuery(api.taskSubscribers.listByTask, { taskId });
  const setSubscription = useMutation(api.taskSubscribers.setSubscription);
  const [managing, setManaging] = useState(false);
  if (subscribers === undefined) return null;
  const ids = new Set<string>(subscribers.map((entry) => entry.userId));
  const subscribed = (users ?? []).filter((user) => ids.has(user._id));
  const isSubscribed = currentUserId ? ids.has(currentUserId) : false;
  const set = (args: { subscribed: boolean; userId?: Id<"users"> }) => {
    setSubscription({ taskId, ...args }).catch(() => toast.error("Couldn't change the subscription"));
  };
  return (
    <View className="flex-row flex-wrap items-center gap-2 px-2 pb-2">
      <Button
        variant={isSubscribed ? "secondary" : "outline"}
        size="sm"
        fullWidth={false}
        disabled={!currentUserId}
        leftIcon={isSubscribed ? <IconBellOff size={14} color={theme.secondaryForeground} /> : <IconBell size={14} color={theme.foreground} />}
        onPress={() => set({ subscribed: !isSubscribed })}
      >
        {isSubscribed ? "Subscribed" : "Subscribe"}
      </Button>
      {subscribed.length > 0 ? (
        <View accessible accessibilityLabel={`Subscribers: ${subscribed.map((user) => getUserDisplayName(user)).join(", ")}`} className="flex-row">
          {subscribed.map((user, index) => (
            <View key={user._id} style={{ marginLeft: index === 0 ? 0 : -4 }}>
              <InitialsAvatar user={user} size={20} />
            </View>
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage subscribers"
        onPress={() => setManaging(true)}
        className="size-11 items-center justify-center rounded-lg active:opacity-70"
      >
        <IconUserPlus size={16} color={theme.mutedForeground} />
      </Pressable>
      <FooterSheet open={managing} onOpenChange={setManaging} title="Manage subscribers">
        {(users ?? []).map((user) => (
          <SheetRow
            key={user._id}
            leading={<InitialsAvatar user={user} size={20} />}
            title={getUserDisplayName(user)}
            active={ids.has(user._id)}
            multiple
            onPress={() => set({ userId: user._id, subscribed: !ids.has(user._id) })}
          />
        ))}
      </FooterSheet>
    </View>
  );
}
