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
import {
  IconMoodSmile,
  IconArrowBackUp,
  IconBell,
  IconBellOff,
  IconClipboard,
  IconPencil,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react-native";
import { MessageContextMenu, ReplyQuoteChip, type MessageMenuRect, type MessageSheetAction } from "@vvedantb/native-ui/ai";
import { Button, ConfirmDialog, SheetRow, type ReactionRowItem } from "@vvedantb/native-ui/primitives";
import { SearchInput } from "@vvedantb/native-ui/search-input";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Clipboard from "expo-clipboard";
import { useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { FooterSheet } from "@/chat/ComposerFooter";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { useScheme } from "@/ui/theme";

type User = FunctionReturnType<typeof api.users.listAll>[number];

/** What the comment box sends: a new comment, a reply to one, or an edit of yours. */
export type CommentMode =
  | { kind: "new" }
  | { kind: "reply"; comment: TaskComment }
  | { kind: "edit"; comment: TaskComment };

/** Above the comment box while it replies or edits: the comment it is about, with an X that goes back to a new comment. */
export function CommentModeChip({
  mode,
  users,
  onDismiss,
}: {
  mode: CommentMode;
  users: User[] | undefined;
  onDismiss: () => void;
}) {
  if (mode.kind === "new") return null;
  const author = users?.find((user) => user._id === mode.comment.authorId);
  const name = author ? getUserDisplayName(author) : "Someone";
  const text = mentionTokensToEditableText(mode.comment.content);
  return mode.kind === "reply" ? (
    <ReplyQuoteChip author={name} text={text} onDismiss={onDismiss} />
  ) : (
    <ReplyQuoteChip
      author="Editing comment"
      text={text}
      onDismiss={onDismiss}
      accessibilityLabel="Editing your comment"
      dismissLabel="Cancel edit"
    />
  );
}

/** As the web picker: suggest after 400 ms without a keystroke, for at least 2 characters. */
const SUGGEST_IDLE_MS = 400;
const SUGGEST_MIN_CHARS = 2;
/** One emoji, with its variation selector, skin tone and joined parts. */
const EMOJI_SOURCE =
  "\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}])*";
/** The pictograph planes, for an engine without Unicode property escapes (a crash at load would take the screen down). */
const EMOJI_FALLBACK =
  "(?:[\\u2600-\\u27BF]|\\uD83C[\\uDC00-\\uDFFF]|\\uD83D[\\uDC00-\\uDFFF]|\\uD83E[\\uDC00-\\uDFFF])(?:\\uFE0F|\\u200D(?:[\\u2600-\\u27BF]|\\uD83C[\\uDC00-\\uDFFF]|\\uD83D[\\uDC00-\\uDFFF]|\\uD83E[\\uDC00-\\uDFFF]))*";
function emojiPattern(flags: string): RegExp {
  try {
    return new RegExp(EMOJI_SOURCE, `${flags}u`);
  } catch {
    return new RegExp(EMOJI_FALLBACK, flags);
  }
}
const EMOJI_ALL = emojiPattern("g");
const HAS_EMOJI = emojiPattern("");

/**
 * The web full emoji picker on the phone, without an emoji data set: a search
 * box. An emoji typed from the keyboard is offered as it is; a word asks Eva
 * (`emojiSuggestions.suggest`, as the web picker's search) once typing pauses.
 * With nothing typed it shows the quick reactions. A pick reacts and closes.
 */
export function EmojiPickerSheet({
  open,
  onOpenChange,
  groups,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ReactionGroup[];
  onPick: (emoji: string) => void;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const suggest = useAction(api.emojiSuggestions.suggest);
  const [search, setSearch] = useState("");
  // Answers are keyed by the query they answer, so a stale one never shows against newer text.
  const [answered, setAnswered] = useState<{
    query: string;
    emoji: string[];
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const query = search.trim();
  const typed = [...new Set(query.match(EMOJI_ALL) ?? [])];
  const change = (value: string) => {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    const next = value.trim();
    if (next.length < SUGGEST_MIN_CHARS || HAS_EMOJI.test(next)) return;
    timer.current = setTimeout(() => {
      suggest({ query: next })
        .then((emoji) => setAnswered({ query: next, emoji }))
        // A failed lookup just leaves the box as it is.
        .catch(() => undefined);
    }, SUGGEST_IDLE_MS);
  };
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setSearch("");
      setAnswered(null);
    }
  };
  const shown =
    typed.length > 0
      ? typed
      : query === ""
        ? QUICK_REACTIONS
        : answered?.query === query
          ? answered.emoji
          : [];
  const searching =
    typed.length === 0 &&
    query.length >= SUGGEST_MIN_CHARS &&
    answered?.query !== query;
  const mine = new Set(
    groups.filter((group) => group.reactedByMe).map((group) => group.emoji),
  );
  return (
    <FooterSheet
      open={open}
      onOpenChange={close}
      title="Add reaction"
      header={
        <View className="px-2">
          <SearchInput
            size="md"
            value={search}
            onChange={change}
            label="Search emoji"
            placeholder="Search, or type an emoji…"
          />
        </View>
      }
    >
      {shown.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 px-2 pb-4">
          {shown.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`${mine.has(emoji) ? "Remove" : "React with"} ${emoji}`}
              accessibilityState={{ selected: mine.has(emoji) }}
              onPress={() => {
                onPick(emoji);
                close(false);
              }}
              className="size-12 items-center justify-center rounded-xl active:opacity-70"
              style={{
                backgroundColor: mine.has(emoji)
                  ? withAlpha(theme.primary, 0.12)
                  : theme.secondary,
              }}
            >
              <Text style={{ fontSize: 24 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text
          className="font-instrument-sans py-6 text-center text-sm"
          style={{ color: theme.mutedForeground }}
        >
          {searching
            ? "Searching…"
            : query.length < SUGGEST_MIN_CHARS
              ? "Keep typing to search."
              : "No emoji found."}
        </Text>
      )}
    </FooterSheet>
  );
}

/** Where a held comment or description is on screen (`measureInWindow`), for the hold menu. */
export type HeldRect = MessageMenuRect;

/** Reads where a held view is on screen (`measureInWindow`), for the hold menu. Call it from a handler. */
export function measureHeld(view: View | null, then: (rect: HeldRect) => void) {
  view?.measureInWindow((x, y, width, height) => then({ x, y, width, height }));
}

/**
 * The web comment actions on the phone, from a comment's "…" or a long press,
 * as the chat's hold menu (iMessage, the kit `MessageContextMenu`): the held
 * comment stays in place, the quick reactions and "More reactions" in a pill
 * above it, and Reply, Edit, Copy text and, for your own comment, Delete
 * (`onDelete` asks first: `DeleteCommentDialog`) in a card below it. The
 * description gets the reactions, Edit and Copy text.
 */
export function ReactableMenu({
  anchor,
  preview,
  onClose,
  groups,
  onToggleReaction,
  onMoreReactions,
  onReply,
  onEdit,
  copyText,
  onDelete,
}: {
  /** Where the held item is; the menu is shut while it is null. */
  anchor: HeldRect | null;
  /** The held item, drawn again over the chat. */
  preview: ReactNode;
  onClose: () => void;
  groups: ReactionGroup[];
  onToggleReaction: (emoji: string) => void;
  /** Opens `EmojiPickerSheet`; the caller renders it, since this menu closes first. */
  onMoreReactions?: () => void;
  onReply?: () => void;
  onEdit?: () => void;
  copyText?: string;
  onDelete?: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const mine = new Set(groups.filter((group) => group.reactedByMe).map((group) => group.emoji));
  const actions: MessageSheetAction[] = [];
  if (onReply) actions.push({ key: "reply", label: "Reply", icon: IconArrowBackUp, onPress: onReply });
  if (onEdit) actions.push({ key: "edit", label: "Edit", icon: IconPencil, onPress: onEdit });
  if (copyText !== undefined) {
    actions.push({ key: "copy", label: "Copy text", icon: IconClipboard, onPress: () => void Clipboard.setStringAsync(copyText) });
  }
  if (onDelete) actions.push({ key: "delete", label: "Delete", icon: IconTrash, destructive: true, onPress: onDelete });
  const items: ReactionRowItem[] = QUICK_REACTIONS.map((emoji) => ({
    key: emoji,
    label: `${mine.has(emoji) ? "Remove" : "Add"} ${emoji} reaction`,
    selected: mine.has(emoji),
    render: () => <Text style={{ fontSize: 22 }}>{emoji}</Text>,
  }));
  // The web picker's trigger icon, last in the pill: every other emoji, by search.
  if (onMoreReactions) {
    items.push({ key: MORE_REACTIONS, label: "More reactions", render: () => <IconMoodSmile size={22} color={theme.mutedForeground} /> });
  }
  return (
    <MessageContextMenu
      open={anchor !== null}
      onClose={onClose}
      anchor={anchor}
      align="start"
      preview={preview}
      menu={{
        reactions: {
          items,
          onPress: (key) => (key === MORE_REACTIONS ? onMoreReactions?.() : onToggleReaction(key)),
        },
        actions,
      }}
    />
  );
}

/** The pill's "More reactions" key: no emoji uses it. */
const MORE_REACTIONS = "more";

/** The web delete dialog for a comment. */
export function DeleteCommentDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
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
  const remove = useMutation(api.taskComments.remove).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.taskComments.listByTask, { taskId });
      if (!current) return;
      store.setQuery(
        api.taskComments.listByTask,
        { taskId },
        current.map((entry) =>
          entry._id === args.id
            ? {
                ...entry,
                deletedAt: Date.now(),
                content: DELETED_COMMENT_PLACEHOLDER,
              }
            : entry,
        ),
      );
    },
  );
  const update = useMutation(api.taskComments.update).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.taskComments.listByTask, { taskId });
      if (!current) return;
      store.setQuery(
        api.taskComments.listByTask,
        { taskId },
        current.map((entry) =>
          entry._id === args.id ? { ...entry, content: args.content } : entry,
        ),
      );
    },
  );
  const create = useMutation(api.taskComments.create);
  return {
    remove: (id: Id<"taskComments">) => {
      remove({ id }).catch(() =>
        toast.error("Could not delete the comment. Try again."),
      );
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
export function TaskSubscribers({
  taskId,
  users,
}: {
  taskId: Id<"agentTasks">;
  users: User[] | undefined;
}) {
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
    setSubscription({ taskId, ...args }).catch(() =>
      toast.error("Couldn't change the subscription"),
    );
  };
  return (
    <View className="flex-row flex-wrap items-center gap-2 px-2 pb-2">
      <Button
        variant={isSubscribed ? "secondary" : "outline"}
        size="sm"
        fullWidth={false}
        disabled={!currentUserId}
        leftIcon={
          isSubscribed ? (
            <IconBellOff size={14} color={theme.secondaryForeground} />
          ) : (
            <IconBell size={14} color={theme.foreground} />
          )
        }
        onPress={() => set({ subscribed: !isSubscribed })}
      >
        {isSubscribed ? "Subscribed" : "Subscribe"}
      </Button>
      {subscribed.length > 0 ? (
        <View
          accessible
          accessibilityLabel={`Subscribers: ${subscribed.map((user) => getUserDisplayName(user)).join(", ")}`}
          className="flex-row"
        >
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
      <FooterSheet
        open={managing}
        onOpenChange={setManaging}
        title="Manage subscribers"
      >
        {(users ?? []).map((user) => (
          <SheetRow
            key={user._id}
            leading={<InitialsAvatar user={user} size={20} />}
            title={getUserDisplayName(user)}
            active={ids.has(user._id)}
            multiple
            onPress={() =>
              set({ userId: user._id, subscribed: !ids.has(user._id) })
            }
          />
        ))}
      </FooterSheet>
    </View>
  );
}
