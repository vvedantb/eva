import { EVA_THEME } from "@eva/shared/evaTheme";
import { MessageContent } from "@vvedantb/native-ui/ai";
import type { ReactNode } from "react";
import { Text, View, type ViewStyle } from "react-native";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { useScheme } from "@/ui/theme";

/** A teammate's turn sits on the left, its parts at the start, as the web `ml-0 mr-auto` and `items-start`. */
export const TEAMMATE_SIDE: ViewStyle = { alignSelf: "flex-start", alignItems: "flex-start" };

/** The web `pl-6` that lines a teammate's footer up with the bubble (avatar 16 and gap 8). */
export const TEAMMATE_FOOTER_INSET = "pl-6";

/**
 * The teammate's first name above their bubble: `text-2xs font-medium`, muted,
 * 36 in (`pl-9`), as the web.
 */
export function TeammateName({ name }: { name: string }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <Text
      numberOfLines={1}
      className="font-instrument-sans-medium pl-9"
      style={{ fontSize: 11, lineHeight: 16, letterSpacing: 0.11, fontWeight: "500", color: theme.mutedForeground }}
    >
      {name}
    </Text>
  );
}

/**
 * A teammate's bubble, as the web `UserTurnBubble` with `isOtherUser`: their
 * 16 avatar at the bottom left, 8 from a `bg-secondary` bubble whose
 * bottom-left corner is square against it.
 */
export function TeammateBubble({
  sender,
  children,
}: {
  /** The sender's profile; undefined while it loads. */
  sender: { firstName?: string; lastName?: string; fullName?: string } | undefined;
  children: ReactNode;
}) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="min-w-0 max-w-full flex-row items-end gap-2">
      <InitialsAvatar user={sender} size={16} />
      <MessageContent bubble="tint" className="shrink" style={{ backgroundColor: theme.secondary, borderBottomLeftRadius: 0 }}>
        {children}
      </MessageContent>
    </View>
  );
}
