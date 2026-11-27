import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  FIND_QUERY_MAX_LENGTH,
  findThreadMatches,
  normalizeFindQuery,
  resolveThreadFindJump,
  stepThreadFindIndex,
  threadFindCountLabel,
  type ThreadFindDocument,
  type ThreadFindMatch,
} from "@eva/shared/threadFind";
import { IconChevronDown, IconChevronUp, IconX, type IconProps } from "@tabler/icons-react-native";
import { useConversation } from "@vvedantb/native-ui/ai";
import { SearchInput } from "@vvedantb/native-ui/search-input";
import { useEffect, useState, type ComponentType } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useScheme } from "@/ui/theme";

/**
 * The web `ThreadFindBar` on the phone ("Find in chat" in the chat ⋯ menu): a
 * search field under the header, the web "2 / 5" count, and up and down to
 * step through the matches. Each match brings its message to the top of
 * the inverted list (`scrollToIndex`, which reaches rows the list has not
 * drawn yet), and `onActiveChange` names that message so its row can show it
 * is the one. It searches the loaded messages; older pages load as the reader
 * scrolls up, as the transcript does. It owns the query, so a keystroke
 * redraws the bar, not the transcript. Render it inside `Conversation`.
 */
export function ThreadFindBar({
  documents,
  rowIndex,
  onActiveChange,
  onClose,
}: {
  documents: readonly ThreadFindDocument[];
  rowIndex: (messageId: string) => number;
  onActiveChange: (messageId: string | null) => void;
  onClose: () => void;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const reduceMotion = useReducedMotion();
  const { scrollRef } = useConversation();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = findThreadMatches(documents, query);
  const matchCount = matches.length;
  const safeIndex = matchCount === 0 ? -1 : Math.min(Math.max(activeIndex, 0), matchCount - 1);
  const hasQuery = normalizeFindQuery(query).length > 0;
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  const jumpTo = (list: readonly ThreadFindMatch[], index: number) => {
    const match = resolveThreadFindJump(list, index);
    onActiveChange(match?.messageId ?? null);
    const row = match ? rowIndex(match.messageId) : -1;
    if (row >= 0) scrollRef.current?.scrollToIndex?.({ index: row, animated: !reduceMotion, viewPosition: 1 });
  };

  const step = (direction: "next" | "previous") => {
    if (matchCount === 0) return;
    const next = stepThreadFindIndex(matchCount, safeIndex, direction);
    setActiveIndex(next);
    jumpTo(matches, next);
  };

  return (
    <View
      accessibilityRole="search"
      className="flex-row items-center gap-1 border-b px-3 py-2"
      style={{ backgroundColor: theme.background, borderColor: theme.border }}
    >
      <SearchInput
        value={query}
        onChange={(next) => {
          setQuery(next);
          setActiveIndex(0);
          jumpTo(findThreadMatches(documents, next), 0);
        }}
        label="Find in thread"
        size="md"
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        submitBehavior="submit"
        onSubmitEditing={() => step("next")}
        maxLength={FIND_QUERY_MAX_LENGTH}
        wrapperClassName="min-w-0 flex-1"
      />
      {hasQuery ? (
        <>
          <Text
            accessibilityLiveRegion="polite"
            className="font-instrument-sans px-1 text-xs"
            style={{ color: theme.mutedForeground, fontVariant: ["tabular-nums"] }}
          >
            {threadFindCountLabel(query, matchCount, safeIndex)}
          </Text>
          <FindButton icon={IconChevronUp} label="Previous match" disabled={matchCount === 0} onPress={() => step("previous")} />
          <FindButton icon={IconChevronDown} label="Next match" disabled={matchCount === 0} onPress={() => step("next")} />
        </>
      ) : null}
      <FindButton icon={IconX} label="Close find" onPress={onClose} />
    </View>
  );
}

function FindButton({
  icon: Icon,
  label,
  disabled = false,
  onPress,
}: {
  icon: ComponentType<IconProps>;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-md active:opacity-70"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Icon size={16} color={muted} />
    </Pressable>
  );
}
