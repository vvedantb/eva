import { useSyncExternalStore } from "react";
import { Text, type TextStyle } from "react-native";
import { timeAgo } from "@/ui/format";

/** One shared clock for every `TimeAgo` on screen: it ticks every 10 seconds while any is mounted. */
const TICK_MS = 10_000;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const entry of listeners) entry();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * `timeAgo(at)` that stays current, as the web `RelativeDateTime`: the age
 * re-reads the shared clock, so a row drawn a minute ago does not still say
 * "0s" beside a newer one.
 */
export function TimeAgo({ at, className, style }: { at: number; className?: string; style?: TextStyle }) {
  useSyncExternalStore(subscribe, () => now);
  return (
    <Text className={className} style={style}>
      {timeAgo(at)}
    </Text>
  );
}
