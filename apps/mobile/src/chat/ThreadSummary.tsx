import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconMessages } from "@tabler/icons-react-native";
import { Pressable, Text } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * The row under a coordinator message that has replies, as the web
 * `ThreadSummary`: "N replies" in the brand colour; a tap opens the thread.
 */
export function ThreadSummary({
  replyCount,
  className,
  onPress,
}: {
  replyCount: number;
  className?: string;
  onPress: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
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
    </Pressable>
  );
}
