import { getUserInitials } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/** The 16 and 20 discs: initials 8 / 10 and 9 / 12. */
const SIZES = {
  16: { box: "size-4", text: { fontSize: 8, lineHeight: 10 } },
  20: { box: "size-5", text: { fontSize: 9, lineHeight: 12 } },
};

/**
 * A user's initials on a muted disc, in place of the web face mark
 * (`UserInitials`). Without a user (a profile still loading) the disc is empty,
 * so the row does not jump when the name arrives. Screen readers skip it: the
 * name beside it says who it is.
 */
export function InitialsAvatar({ user, size }: { user: Parameters<typeof getUserInitials>[0] | undefined; size: 16 | 20 }) {
  const theme = EVA_THEME[useScheme()];
  const { box, text } = SIZES[size];
  return (
    <View
      className={`${box} shrink-0 items-center justify-center rounded-full`}
      style={{ backgroundColor: theme.muted }}
      aria-hidden
    >
      {user ? <Text style={{ ...text, fontWeight: "600", color: theme.mutedForeground }}>{getUserInitials(user)}</Text> : null}
    </View>
  );
}
