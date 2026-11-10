import { IconChevronLeft, IconDots, IconExternalLink, IconLink, IconPlayerStopFilled } from "@tabler/icons-react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HeaderIconButton,
} from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScheme } from "@/ui/theme";

/**
 * The chat header, as the web chat bar: the repo initial and name, then the
 * chat title ("S Storefront / Add dark mode…"), and a ⋯ menu. A back button
 * leads, as phones expect; the web's drawer has no back.
 */
export function ChatHeader({
  repoLabel,
  title,
  onBack,
  onOpenWeb,
  onCopyLink,
  onStop,
}: {
  repoLabel: string;
  title: string;
  onBack: () => void;
  onOpenWeb: () => void;
  onCopyLink: () => void;
  /** Set while the agent works: Stop in the menu. */
  onStop?: () => void;
}) {
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const muted = tokens.color.muted[scheme];
  const foreground = tokens.color.foreground[scheme];
  return (
    <View className="flex-row items-center gap-2 px-3 pb-2" style={{ paddingTop: insets.top + 8 }}>
      <HeaderIconButton label="Back" onPress={onBack}>
        <IconChevronLeft size={20} color={foreground} />
      </HeaderIconButton>
      <View className="min-w-0 flex-1 flex-row items-center gap-1.5" accessibilityRole="header" accessibilityLabel={`${repoLabel}, ${title}`}>
        {/* Web breadcrumb: an 18 initial tile, the repo in medium muted, a slash, the title in semibold. */}
        <View
          className="h-[18px] w-[18px] items-center justify-center rounded"
          style={{ backgroundColor: tokens.color.surfaceSecondary[scheme] }}
        >
          <Text className="font-instrument-sans-semibold" style={{ fontSize: 10, color: muted, fontWeight: "600" }}>
            {repoLabel.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text className="font-instrument-sans-medium text-sm" style={{ color: muted, fontWeight: "500" }}>
          {repoLabel}
        </Text>
        <Text className="font-instrument-sans text-sm" style={{ color: muted }}>
          /
        </Text>
        <Text numberOfLines={1} className="font-instrument-sans-semibold min-w-0 flex-1 text-sm" style={{ color: foreground, fontWeight: "600" }}>
          {title}
        </Text>
      </View>
      <DropdownMenu>
        <DropdownMenuTrigger accessibilityLabel="Chat options" hitSlop={4} className="h-11 w-11 items-center justify-center rounded-full active:opacity-70" style={{ backgroundColor: tokens.color.surfaceSecondary[scheme] }}>
          <IconDots size={18} color={foreground} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem icon={IconExternalLink} onSelect={onOpenWeb}>
            Open on web
          </DropdownMenuItem>
          <DropdownMenuItem icon={IconLink} onSelect={onCopyLink}>
            Copy link
          </DropdownMenuItem>
          {onStop ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={IconPlayerStopFilled} destructive onSelect={onStop}>
                Stop
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}
