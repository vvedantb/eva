import { Text } from "@vvedantb/native-ui/primitives";
import { timeAgo } from "@/ui/format";
import { textColor, useScheme } from "@/ui/theme";

/** A list row's time, for `ListRow` `titleEnd` (the slot native-ui names for a time). */
export function RowTime({ at }: { at: number }) {
  const scheme = useScheme();
  return (
    <Text variant="muted" style={textColor(scheme, "muted")}>
      {timeAgo(at)}
    </Text>
  );
}
