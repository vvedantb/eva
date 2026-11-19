import { IconDots } from "@tabler/icons-react-native";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { palette } from "@vvedantb/native-ui/theme";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { type Scheme, useScheme } from "@/ui/theme";

/**
 * The trough of the phone's segmented control (`SegmentedTabs`) and of the
 * header rail: the kit track in light, the card grey in dark, as the web
 * `tabs-segmented` and `rail-track` (`--secondary` in light, `--card` in dark).
 */
export function segmentTrough(scheme: Scheme): string {
  return scheme === "light" ? palette.default.light : EVA_THEME[scheme].card;
}

/**
 * The web chat header's `CHAT_HEADER_ACTIONS_CLASS`: a header's secondary
 * buttons on one shared trough. The buttons on it are flat (no fill of their
 * own) and 44 round, so the rail is 44 high with no padding and the header
 * keeps its height. Primary filled actions stay outside it. Render it only
 * when it holds a button, so an empty trough never shows.
 */
export function HeaderRail({ children }: { children: ReactNode }) {
  const scheme = useScheme();
  return (
    <View className="shrink-0 flex-row items-center rounded-full" style={{ backgroundColor: segmentTrough(scheme) }}>
      {children}
    </View>
  );
}

/** A page header's "…" on the rail: a flat 44 round button with the muted dots. */
export function HeaderMoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <HeaderRail>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
      >
        <IconDots size={16} color={muted} />
      </Pressable>
    </HeaderRail>
  );
}
