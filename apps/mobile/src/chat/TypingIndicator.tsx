import { EVA_THEME } from "@eva/shared/evaTheme";
import { typingLabelParts, type TypingUser } from "@eva/shared/typingPresence";
import { Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * The web `TypingIndicator` on the phone: the first typer's initial in a
 * primary circle, then "Ada is typing…" (or "Ada and Bo are typing…", "Ada and
 * 2 others are typing…") in muted 12. Nothing while nobody types.
 */
export function TypingIndicator({ users }: { users: readonly TypingUser[] }) {
  const theme = EVA_THEME[useScheme()];
  if (users.length === 0) return null;
  const label = `${typingLabelParts(users)
    .map((part) => ("name" in part ? part.name : part.text))
    .join("")}…`;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      className="flex-row items-center gap-1.5 px-1 pb-1.5"
    >
      <View
        className="size-5 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.primary }}
      >
        <Text
          className="font-instrument-sans-medium"
          style={{
            fontSize: 9,
            fontWeight: "500",
            color: theme.primaryForeground,
          }}
        >
          {(users[0]?.firstName ?? "?").charAt(0).toUpperCase()}
        </Text>
      </View>
      <Text
        className="font-instrument-sans"
        style={{ fontSize: 12, lineHeight: 16, color: theme.mutedForeground }}
      >
        {label}
      </Text>
    </View>
  );
}

/** The coordinator's live turn in its bubble, as the web `EvaTypingLine`: "Eva is typing…" in muted 12. */
export function EvaTypingText() {
  const theme = EVA_THEME[useScheme()];
  return (
    <Text
      accessibilityLiveRegion="polite"
      className="font-instrument-sans"
      style={{ fontSize: 12, lineHeight: 16, color: theme.mutedForeground }}
    >
      Eva is typing…
    </Text>
  );
}
