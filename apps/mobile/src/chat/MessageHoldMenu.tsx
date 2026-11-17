import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconClipboard,
  IconGitFork,
  IconLink,
  IconRefresh,
  IconThumbDown,
  IconThumbDownFilled,
  IconThumbUp,
  IconThumbUpFilled,
} from "@tabler/icons-react-native";
import { SheetRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import * as Clipboard from "expo-clipboard";
import { Pressable, View } from "react-native";
import type { Sentiment } from "@/chat/MessageFooter";
import { TurnChangesRows, type TurnChangesTarget } from "@/chat/TurnChangesChip";
import { MenuDivider, MenuSheet } from "@/ui/MenuSheet";
import { useScheme } from "@/ui/theme";

/** What a held message offers: each action is there only when it applies. */
export type HeldMessage = {
  text: string;
  /** The message's web permalink. */
  link: string;
  /** Agent replies: the viewer's thumbs and the setter (`null` clears). */
  rating?: { sentiment: Sentiment | undefined; onRate: (sentiment: Sentiment | null) => void };
  onFork?: () => void;
  /** A failed turn: re-sends the prompt it answered. */
  onRetry?: () => void;
  /** A session reply that changed code: Diff this turn and Restore. */
  turn?: TurnChangesTarget;
};

/**
 * The message footer's actions behind a press and hold (user choice, as
 * iMessage): the reply's thumbs on top, then Copy text, Copy link, Fork from
 * here, Retry on a failed turn, and Diff this turn and Restore on a reply
 * that changed code. A choice closes the menu first.
 */
export function MessageHoldMenu({
  message,
  onClose,
  onRestore,
}: {
  /** The held message, or null while the menu is shut. */
  message: HeldMessage | null;
  onClose: () => void;
  /** Opens the restore confirm (`useTurnRestore`) for the held reply. */
  onRestore: (turn: TurnChangesTarget) => void;
}) {
  const act = (action: () => void) => {
    onClose();
    action();
  };
  const copy = (value: string, done: string) =>
    void Clipboard.setStringAsync(value).then(
      () => toast.success(done),
      () => toast.error("Couldn't copy"),
    );
  const turn = message?.turn;
  const onFork = message?.onFork;
  const onRetry = message?.onRetry;
  return (
    <MenuSheet
      open={message !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Message"
    >
      {message?.rating ? (
        <>
          <RatingRow rating={message.rating} onDone={onClose} />
          <MenuDivider />
        </>
      ) : null}
      {message ? (
        <>
          <SheetRow icon={IconClipboard} title="Copy text" onPress={() => act(() => copy(message.text, "Copied"))} />
          <SheetRow icon={IconLink} title="Copy link" onPress={() => act(() => copy(message.link, "Link copied"))} />
          {onFork ? <SheetRow icon={IconGitFork} title="Fork from here" onPress={() => act(onFork)} /> : null}
          {onRetry ? <SheetRow icon={IconRefresh} title="Retry" onPress={() => act(onRetry)} /> : null}
        </>
      ) : null}
      {turn ? (
        <>
          <MenuDivider />
          <TurnChangesRows turn={turn} close={onClose} onRestore={() => onRestore(turn)} />
        </>
      ) : null}
    </MenuSheet>
  );
}

/** The reply's thumbs as two round 48 buttons, the chosen one solid with a filled icon; a second tap clears it. */
function RatingRow({ rating, onDone }: { rating: NonNullable<HeldMessage["rating"]>; onDone: () => void }) {
  const theme = EVA_THEME[useScheme()];
  const options: Array<{ sentiment: Sentiment; label: string; icon: typeof IconThumbUp; chosenIcon: typeof IconThumbUp }> = [
    { sentiment: "positive", label: "Good response", icon: IconThumbUp, chosenIcon: IconThumbUpFilled },
    { sentiment: "negative", label: "Bad response", icon: IconThumbDown, chosenIcon: IconThumbDownFilled },
  ];
  return (
    <View className="flex-row gap-3 px-4 py-2">
      {options.map(({ sentiment, label, icon, chosenIcon }) => {
        const selected = rating.sentiment === sentiment;
        const Icon = selected ? chosenIcon : icon;
        return (
          <Pressable
            key={sentiment}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => {
              rating.onRate(selected ? null : sentiment);
              onDone();
            }}
            className="h-12 w-12 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: selected ? theme.primary : theme.secondary }}
          >
            <Icon size={20} color={selected ? theme.primaryForeground : theme.foreground} />
          </Pressable>
        );
      })}
    </View>
  );
}
