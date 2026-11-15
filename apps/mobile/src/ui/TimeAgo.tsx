import { Text, type TextStyle } from "react-native";
import { useNow } from "@/ui/clock";
import { timeAgo } from "@/ui/format";

/**
 * `timeAgo(at)` that stays current, as the web `RelativeDateTime`: it reads a
 * shared 10-second clock, so a row drawn a minute ago does not still say "0s"
 * beside a newer one.
 */
export function TimeAgo({ at, className, style }: { at: number; className?: string; style?: TextStyle }) {
  useNow(10_000);
  return (
    <Text className={className} style={style}>
      {timeAgo(at)}
    </Text>
  );
}
