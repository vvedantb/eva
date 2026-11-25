import { threadTurnStatusText } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { Pressable, Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * The web `ThreadTurnStatus` on the phone: above the coordinator chat's composer while Eva's turn answers
 * in a reply thread (or waits on a question there), in the typing indicator's muted 12. The root's first
 * words open that thread.
 */
export function ThreadTurnStatus({
  preview,
  hasQuestion,
  onOpen,
}: {
  preview: string;
  hasQuestion: boolean;
  onOpen: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View accessibilityLiveRegion="polite" className="flex-row items-center gap-1 px-4 pb-1.5">
      <Text className="font-instrument-sans" style={{ fontSize: 12, lineHeight: 16, color: theme.mutedForeground }}>
        {threadTurnStatusText(hasQuestion)}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open the thread on ${preview}`}
        hitSlop={8}
        onPress={onOpen}
        className="min-w-0 shrink"
      >
        <Text
          numberOfLines={1}
          className="font-instrument-sans-medium"
          style={{ fontSize: 12, lineHeight: 16, fontWeight: "500", color: theme.foreground }}
        >
          {preview}
        </Text>
      </Pressable>
    </View>
  );
}
