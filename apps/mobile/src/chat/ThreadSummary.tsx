import { api } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconMessages } from "@tabler/icons-react-native";
import { useQuery } from "convex/react";
import { Pressable, Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * The row under a coordinator message that has replies, as the web
 * `ThreadSummary`: "N replies" in the brand colour, then "N new" in the
 * mention blue when you follow the thread and have replies you have not
 * seen; a tap opens the thread.
 */
export function ThreadSummary({
  rootId,
  replyCount,
  className,
  onPress,
}: {
  rootId: string;
  replyCount: number;
  className?: string;
  onPress: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const unread = useQuery(api.threads.readState, { rootId })?.unread ?? 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-row items-center gap-1 py-1 ${className ?? ""}`}
      hitSlop={8}
    >
      <IconMessages size={14} color={theme.primary} />
      <Text className="font-instrument-sans-medium text-xs" style={{ color: theme.primary }}>
        {replyCount === 1 ? "1 reply" : `${replyCount} replies`}
      </Text>
      {unread > 0 ? (
        <View className="ml-1 rounded-full px-1.5" style={{ backgroundColor: theme.mention }}>
          <Text
            className="font-instrument-sans-medium text-xs"
            style={{ color: theme.mentionForeground, fontVariant: ["tabular-nums"] }}
          >
            {unread} new
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
