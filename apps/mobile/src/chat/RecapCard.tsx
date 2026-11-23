import { RECAP_TITLE } from "@eva/shared/chatReadState";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconX } from "@tabler/icons-react-native";
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
export function RecapCard({ kind, text, onDismiss }: { kind: "away" | "full"; text: string | undefined; onDismiss: () => void }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="gap-2 rounded-2xl p-3" style={{ backgroundColor: theme.muted }}>
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 font-instrument-sans-medium text-sm" style={{ fontWeight: "500", color: theme.foreground }}>
          {RECAP_TITLE[kind]}
        </Text>
        <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
          Visible only to you
        </Text>
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
