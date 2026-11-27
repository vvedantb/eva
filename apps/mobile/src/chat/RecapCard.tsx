import { recapTitle } from "@eva/shared/chatReadState";
import type { FeedbackSentiment } from "@eva/shared/chatFeedback";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconThumbDown, IconThumbDownFilled, IconThumbUp, IconThumbUpFilled, IconX } from "@tabler/icons-react-native";
import { Shimmer } from "@vvedantb/native-ui/ai";
import { Pressable, Text, View } from "react-native";
import { MessageMarkdown } from "@/chat/MentionChip";
import { useScheme } from "@/ui/theme";

/**
 * The web `ChatRecapCard`: the user's recap of this chat (`useChatRecap`),
 * under the newest message: "Since you've been gone" after an absence,
 * "Recap" from Recap chat. Only this user sees it. The goal banner's surface: `bg-muted`,
 * radius 16. The × has a 44 point target.
 */
export function RecapCard({
  kind,
  since,
  text,
  rating,
  onRate,
  onDismiss,
}: {
  kind: "away" | "full";
  /** When the absence began (ms); only an "away" title shows it. */
  since: number;
  text: string | undefined;
  /** The viewer's thumbs on this recap. */
  rating: FeedbackSentiment | undefined;
  /** Sets the thumbs; `null` clears them. */
  onRate: (sentiment: FeedbackSentiment | null) => void;
  onDismiss: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="gap-2 rounded-2xl p-3" style={{ backgroundColor: theme.muted }}>
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 font-instrument-sans-medium text-sm" style={{ fontWeight: "500", color: theme.foreground }}>
          {recapTitle(kind, since)}
        </Text>
        <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
          Visible only to you
        </Text>
        {text === undefined
          ? null
          : (["positive", "negative"] as const).map((value) => {
              const active = rating === value;
              const Icon = value === "positive" ? (active ? IconThumbUpFilled : IconThumbUp) : active ? IconThumbDownFilled : IconThumbDown;
              const label = value === "positive" ? "Helpful recap" : "Unhelpful recap";
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={active ? "Remove rating" : label}
                  accessibilityState={{ selected: active }}
                  hitSlop={12}
                  onPress={() => onRate(active ? null : value)}
                  className="size-5 items-center justify-center active:opacity-70"
                >
                  <Icon size={16} color={active ? theme.foreground : theme.mutedForeground} />
                </Pressable>
              );
            })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss recap"
          hitSlop={12}
          onPress={onDismiss}
          className="size-5 items-center justify-center active:opacity-70"
        >
          <IconX size={16} color={theme.mutedForeground} />
        </Pressable>
      </View>
      {text === undefined ? <Shimmer>Catching you up…</Shimmer> : <MessageMarkdown content={text} />}
    </View>
  );
}
