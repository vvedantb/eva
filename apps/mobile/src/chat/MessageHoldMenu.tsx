import { EVA_THEME } from "@eva/shared/evaTheme";
import { DIFF_TURN_LABEL, restoreTurnLabel } from "@eva/shared/turnCheckpoint";
import {
  IconArrowBackUp,
  IconClipboard,
  IconCursorText,
  IconGitCompare,
  IconGitFork,
  IconLink,
  IconMessages,
  IconRefresh,
  IconThumbDown,
  IconThumbDownFilled,
  IconThumbUp,
  IconThumbUpFilled,
} from "@tabler/icons-react-native";
import type { MessageMenu, MessageSheetAction } from "@vvedantb/native-ui/ai";
import { toast } from "@vvedantb/native-ui/toast";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import type { Sentiment } from "@/chat/MessageFooter";
import type { TurnChangesTarget } from "@/chat/TurnChangesChip";
import { useScheme } from "@/ui/theme";

/** What a held message offers: each action is there only when it applies. */
export type HeldMessage = {
  text: string;
  link: string;
  rating?: { sentiment: Sentiment | undefined; onRate: (sentiment: Sentiment | null) => void };
  onFork?: () => void;
  onRetry?: () => void;
  turn?: TurnChangesTarget;
  onSelectText?: () => void;
  onReply?: () => void;
};

/**
 * The message footer's actions behind a press and hold, as iMessage (user
 * choice): the kit `Message` `menu`, with the reply's thumbs in the pill
 * above the message and, in the card below it, Copy text, Select text on a
 * reply (to quote a part of it, the web's selection "Cite"), Copy link, Fork
 * from here, Retry on a failed turn, and Diff this turn and Restore on a reply
 * that changed code (Restore dimmed while the sandbox sleeps). `onRestore`
 * opens the restore confirm (`useTurnRestore`).
 */
export function useMessageMenu(onRestore: (turn: TurnChangesTarget) => void): (message: HeldMessage) => MessageMenu {
  const theme = EVA_THEME[useScheme()];
  const router = useRouter();
  const copy = (value: string, done: string) =>
    void Clipboard.setStringAsync(value).then(
      () => toast.success(done),
      () => toast.error("Couldn't copy"),
    );
  const thumbs: Array<{ sentiment: Sentiment; label: string; icon: typeof IconThumbUp; chosenIcon: typeof IconThumbUp }> = [
    { sentiment: "positive", label: "Good response", icon: IconThumbUp, chosenIcon: IconThumbUpFilled },
    { sentiment: "negative", label: "Bad response", icon: IconThumbDown, chosenIcon: IconThumbDownFilled },
  ];

  return (message) => {
    const { rating, onFork, onRetry, turn, onSelectText, onReply } = message;
    const actions: MessageSheetAction[] = [];
    if (onReply) actions.push({ key: "reply", label: "Reply in thread", icon: IconMessages, onPress: onReply });
    actions.push({ key: "copy", label: "Copy text", icon: IconClipboard, onPress: () => copy(message.text, "Copied") });
    if (onSelectText) actions.push({ key: "select", label: "Select text", icon: IconCursorText, onPress: onSelectText });
    actions.push({ key: "link", label: "Copy link", icon: IconLink, onPress: () => copy(message.link, "Link copied") });
    if (onFork) actions.push({ key: "fork", label: "Fork from here", icon: IconGitFork, onPress: onFork });
    if (onRetry) actions.push({ key: "retry", label: "Retry", icon: IconRefresh, onPress: onRetry });
    if (turn) {
      actions.push({
        key: "diff",
        label: DIFF_TURN_LABEL,
        icon: IconGitCompare,
        onPress: () =>
          router.push({
            pathname: "/chat/[target]/turn-diff",
            params: { target: turn.target, repoId: turn.repoId, base: turn.checkpoint.beforeSha, head: turn.checkpoint.afterSha },
          }),
      });
      actions.push({
        key: "restore",
        label: restoreTurnLabel(true),
        icon: IconArrowBackUp,
        disabled: !turn.sandboxRunning,
        onPress: () => onRestore(turn),
      });
    }
    return {
      reactions: rating
        ? {
            items: thumbs.map(({ sentiment, label, icon: Icon, chosenIcon: Chosen }) => ({
              key: sentiment,
              label,
              selected: rating.sentiment === sentiment,
              render: (selected: boolean) =>
                selected ? <Chosen size={22} color={theme.primary} /> : <Icon size={22} color={theme.mutedForeground} />,
            })),
            onPress: (key: string) => {
              const option = thumbs.find((entry) => entry.sentiment === key);
              if (option) rating.onRate(rating.sentiment === option.sentiment ? null : option.sentiment);
            },
          }
        : undefined,
      actions,
    };
  };
}
