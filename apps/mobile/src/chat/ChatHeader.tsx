import {
  IconChevronLeft,
  IconDots,
  IconExternalLink,
  IconLink,
  IconPlayerStopFilled,
  type IconProps,
} from "@tabler/icons-react-native";
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
import { withAlpha } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import { Fragment, type ComponentType, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SESSION_ACTION_ITEMS } from "@/sessions/useSessionActions";
import { HeaderRail } from "@/ui/HeaderRail";
import { RepoLogo } from "@/ui/RepoLogo";
import { displayTitle } from "@/ui/format";
import { useScheme } from "@/ui/theme";

const NO_ITEMS: MenuEntry[] = [];

/** One ⋯ menu item: the `DropdownMenuItem` label, icon and tone. */
export type MenuEntry = {
  label: string;
  icon: ComponentType<IconProps>;
  warning?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

/**
 * The chat header, as the web chat bar: the repo logo (else its initial) and name, then the
 * chat title ("S Storefront / Add dark mode…"), then the wake / sleep control, the usage
 * button and a ⋯ menu on one trough (`HeaderRail`, the web `CHAT_HEADER_ACTIONS_CLASS`). The tile
 * takes the repo's web colour (`repoTileSlot`, the `--cat-*` ramp) once the
 * repo loads, grey until then. A back button
 * leads, as phones expect; the web's drawer has no back. In a session the
 * menu also has the session's Rename and Archive / Unarchive, which the web
 * puts on the session's own tab; the phone has no tab strip. The menu keeps
 * the web groups, a divider between each.
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
  leadingItems = NO_ITEMS,
  usage,
  sandbox,
  subtitle,
}: {
  repoId: Id<"githubRepos">;
  repoLabel: string;
  title: string;
  onBack: () => void;
  onOpenWeb: () => void;
  onCopyLink: () => void;
  onStop?: () => void;
  sessionMenu?: {
    groups: SessionMenuAction[][];
    onSelect: (action: SessionMenuAction) => void;
    itemFor: (action: SessionMenuAction) => { label: string; icon: ComponentType<IconProps>; warning?: boolean };
  };
  leadingItems?: MenuEntry[];
  usage?: ReactNode;
  sandbox?: ReactNode;
  subtitle?: ReactNode;
}) {
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const muted = EVA_THEME[scheme].mutedForeground;
  const foreground = EVA_THEME[scheme].foreground;
  const repo = useQuery(api.githubRepos.get, { id: repoId });
  const logoUrl = useQuery(api.githubRepos.getLogoUrl, { repoId });
  const tileColor = repo ? EVA_THEME[scheme][`cat${repoTileSlot(`${repo.owner}/${repo.name}/${repoDisplayLabel(repo)}`)}`] : undefined;
  const sessionItems = (actions: SessionMenuAction[]): MenuEntry[] =>
    actions.map((action) => ({ ...(sessionMenu ? sessionMenu.itemFor(action) : SESSION_ACTION_ITEMS[action]), onSelect: () => sessionMenu?.onSelect(action) }));
  const [sessionMain = [], ...sessionRest] = sessionMenu?.groups ?? [];
  const isEdit = (action: SessionMenuAction) => action === "rename" || action === "regenerateTitle";
  const menuGroups: MenuEntry[][] = [
    leadingItems,
    sessionItems(sessionMain.filter(isEdit)),
    [
      ...sessionItems(sessionMain.filter((action) => action === "copyTitle")),
      { label: "Copy link", icon: IconLink, onSelect: onCopyLink },
      ...sessionItems(sessionMain.filter((action) => !isEdit(action) && action !== "copyTitle")),
      { label: "Open on web", icon: IconExternalLink, onSelect: onOpenWeb },
    ],
    ...sessionRest.map(sessionItems),
    onStop ? [{ label: "Stop", icon: IconPlayerStopFilled, destructive: true, onSelect: onStop }] : [],
  ].filter((group) => group.length > 0);
  return (
    <View className="flex-row items-center gap-2 px-3 pb-2" style={{ paddingTop: insets.top + 8 }}>
      <HeaderIconButton label="Back" onPress={onBack}>
        <IconChevronLeft size={20} color={foreground} />
      </HeaderIconButton>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="min-w-0 flex-row items-center gap-1.5" accessibilityRole="header" accessibilityLabel={`${repoLabel}, ${displayTitle(title)}`}>
          <RepoLogo
            logoUrl={logoUrl}
            size={16}
            bordered={false}
            fallback={
              <View
                className="h-4 w-4 items-center justify-center rounded"
                style={{ backgroundColor: tileColor ? withAlpha(tileColor, 0.12) : EVA_THEME[scheme].muted }}
              >
                <Text className="font-instrument-sans-semibold" style={{ fontSize: 9, color: tileColor ?? muted, fontWeight: "600" }}>
                  {repoLabel.charAt(0).toUpperCase()}
                </Text>
              </View>
            }
          />
          <Text numberOfLines={1} className="font-instrument-sans-medium max-w-[50%] shrink text-sm" style={{ color: muted, fontWeight: "500" }}>
            {repoLabel}
          </Text>
          <Text className="font-instrument-sans text-sm" style={{ color: withAlpha(muted, 0.5) }}>
            /
          </Text>
          <Text numberOfLines={1} className="font-instrument-sans-semibold min-w-0 flex-1 text-sm" style={{ color: foreground, fontWeight: "600" }}>
            {displayTitle(title)}
          </Text>
        </View>
        {subtitle}
      </View>
      <HeaderRail>
        {sandbox}
        {usage}
        <DropdownMenu>
          <DropdownMenuTrigger accessibilityLabel="Chat options" hitSlop={4} className="h-11 w-11 items-center justify-center rounded-full active:opacity-70">
            <IconDots size={18} color={foreground} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menuGroups.map((group, index) => (
              <Fragment key={group.map((item) => item.label).join()}>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                {group.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    icon={item.icon}
                    warning={item.warning}
                    destructive={item.destructive}
                    disabled={item.disabled}
                    onSelect={item.onSelect}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </HeaderRail>
    </View>
  );
}
