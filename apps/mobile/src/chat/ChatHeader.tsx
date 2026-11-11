import { IconChevronLeft, IconDots, IconExternalLink, IconLink, IconPlayerStopFilled } from "@tabler/icons-react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HeaderIconButton,
} from "@vvedantb/native-ui/primitives";
import { api, type Id } from "@eva/backend";
import { repoDisplayLabel, repoTileSlot, type SessionMenuAction } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { tokens, withAlpha } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SESSION_ACTION_ITEMS } from "@/sessions/useSessionActions";
import { useScheme } from "@/ui/theme";

/**
 * The chat header, as the web chat bar: the repo initial and name, then the
 * chat title ("S Storefront / Add dark mode…"), and a ⋯ menu. The tile
 * takes the repo's web colour (`repoTileSlot`, the `--cat-*` ramp) once the
 * repo loads, grey until then. A back button
 * leads, as phones expect; the web's drawer has no back. In a session the
 * menu also has the session's Rename and Archive / Unarchive, which the web
 * puts on the session's own tab; the phone has no tab strip.
 */
export function ChatHeader({
  repoId,
  repoLabel,
  title,
  onBack,
  onOpenWeb,
  onCopyLink,
  onStop,
  sessionMenu,
}: {
  /** The chat's repo (the web `githubRepos.get`), for the tile colour. */
  repoId: Id<"githubRepos">;
  repoLabel: string;
  title: string;
  onBack: () => void;
  onOpenWeb: () => void;
  onCopyLink: () => void;
  /** Set while the agent works: Stop in the menu. */
  onStop?: () => void;
  /** Session chats: these session actions (`useSessionActions`) after Copy link. */
  sessionMenu?: { actions: SessionMenuAction[]; onSelect: (action: SessionMenuAction) => void };
}) {
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const muted = tokens.color.muted[scheme];
  const foreground = tokens.color.foreground[scheme];
  const repo = useQuery(api.githubRepos.get, { id: repoId });
  // The web seed (`SessionSwitcher`): owner, name and display label.
  const tileColor = repo ? EVA_THEME[scheme][`cat${repoTileSlot(`${repo.owner}/${repo.name}/${repoDisplayLabel(repo)}`)}`] : undefined;
  return (
    <View className="flex-row items-center gap-2 px-3 pb-2" style={{ paddingTop: insets.top + 8 }}>
      <HeaderIconButton label="Back" onPress={onBack}>
        <IconChevronLeft size={20} color={foreground} />
      </HeaderIconButton>
      <View className="min-w-0 flex-1 flex-row items-center gap-1.5" accessibilityRole="header" accessibilityLabel={`${repoLabel}, ${title}`}>
        {/* Web breadcrumb: a 16 initial tile (the cat colour on a 12% tint), the repo in medium muted, a slash at 50%, the title in semibold. */}
        <View
          className="h-4 w-4 items-center justify-center rounded"
          style={{ backgroundColor: tileColor ? withAlpha(tileColor, 0.12) : tokens.color.surfaceSecondary[scheme] }}
        >
          <Text className="font-instrument-sans-semibold" style={{ fontSize: 9, color: tileColor ?? muted, fontWeight: "600" }}>
            {repoLabel.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text className="font-instrument-sans-medium text-sm" style={{ color: muted, fontWeight: "500" }}>
          {repoLabel}
        </Text>
        <Text className="font-instrument-sans text-sm" style={{ color: withAlpha(muted, 0.5) }}>
          /
        </Text>
        <Text numberOfLines={1} className="font-instrument-sans-semibold min-w-0 flex-1 text-sm" style={{ color: foreground, fontWeight: "600" }}>
          {title}
        </Text>
      </View>
      <DropdownMenu>
        <DropdownMenuTrigger accessibilityLabel="Chat options" hitSlop={4} className="h-11 w-11 items-center justify-center rounded-full active:opacity-70" style={{ backgroundColor: EVA_THEME[scheme].secondary }}>
          <IconDots size={18} color={foreground} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem icon={IconExternalLink} onSelect={onOpenWeb}>
            Open on web
          </DropdownMenuItem>
          <DropdownMenuItem icon={IconLink} onSelect={onCopyLink}>
            Copy link
          </DropdownMenuItem>
          {sessionMenu && sessionMenu.actions.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              {sessionMenu.actions.map((action) => {
                const item = SESSION_ACTION_ITEMS[action];
                return (
                  <DropdownMenuItem
                    key={action}
                    icon={item.icon}
                    warning={item.warning}
                    onSelect={() => sessionMenu.onSelect(action)}
                  >
                    {item.label}
                  </DropdownMenuItem>
                );
              })}
            </>
          ) : null}
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
