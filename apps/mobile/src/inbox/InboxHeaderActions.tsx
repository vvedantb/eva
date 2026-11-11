import type { InboxGroup } from "@eva/shared/notificationGroups";
import { IconChecklist, IconChecks, IconChevronDown, IconFilter, type IconProps } from "@tabler/icons-react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import type { ComponentType } from "react";
import { Pressable, Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

export type InboxFilter = "all" | "unread" | "archived";

const FILTERS: readonly InboxFilter[] = ["all", "unread", "archived"];
const GROUPS: readonly InboxGroup[] = ["day", "repo", "type", "urgency"];

/** The web `InboxFilterMenu` labels. */
const FILTER_LABELS: Record<InboxFilter, string> = { all: "All", unread: "Unread", archived: "Archived" };
const GROUP_LABELS: Record<InboxGroup, string> = { day: "Day", repo: "Repo", type: "Type", urgency: "Urgency" };

/** The web `h-7` header buttons are 28 high: 8 above and below reach 44. */
const PILL_SLOP = { top: 8, bottom: 8, left: 2, right: 2 } as const;

/**
 * A web `Button size="sm"` in the inbox header, icon only at phone width: a
 * 28-high pill, `outline` (1px border, no fill) or `ghost` (neither).
 */
function HeaderPill({
  icon: Icon,
  label,
  outline,
  color,
  onPress,
}: {
  icon: ComponentType<IconProps>;
  label: string;
  outline: boolean;
  color: string;
  onPress: () => void;
}) {
  const scheme = useScheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={PILL_SLOP}
      className="h-7 items-center justify-center rounded-full px-3 active:opacity-70"
      style={outline ? { borderWidth: 1, borderColor: tokens.color.border[scheme] } : undefined}
    >
      <Icon size={16} color={color} />
    </Pressable>
  );
}

/**
 * The web inbox header actions at phone width: Mark all as read (only while
 * something is unread), Select, and the filter menu (Show and Group by, the
 * web `InboxFilterMenu`).
 */
export function InboxHeaderActions({
  filter,
  onFilterChange,
  group,
  onGroupChange,
  unreadCount,
  onMarkAllRead,
  selecting,
  onToggleSelecting,
}: {
  filter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  group: InboxGroup;
  onGroupChange: (group: InboxGroup) => void;
  unreadCount: number;
  onMarkAllRead: () => void;
  selecting: boolean;
  onToggleSelecting: () => void;
}) {
  const scheme = useScheme();
  const muted = tokens.color.muted[scheme];
  return (
    <View className="flex-row items-center gap-1.5">
      {unreadCount > 0 ? (
        <HeaderPill icon={IconChecks} label="Mark all as read" outline color={muted} onPress={onMarkAllRead} />
      ) : null}
      <HeaderPill
        icon={IconChecklist}
        label={selecting ? "Cancel selection" : "Select notifications"}
        outline={false}
        color={selecting ? tokens.color.foreground[scheme] : muted}
        onPress={onToggleSelecting}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          accessibilityLabel={`Filter notifications: ${FILTER_LABELS[filter]}, grouped by ${GROUP_LABELS[group]}`}
          hitSlop={PILL_SLOP}
          className="h-7 flex-row items-center gap-1.5 rounded-full px-2 active:opacity-70"
        >
          <IconFilter size={16} color={muted} />
          {/* The web button label: `text-xs` semibold with -0.01em tracking. */}
          <Text
            className="font-instrument-sans-semibold text-xs"
            style={{ color: muted, fontWeight: "600", letterSpacing: -0.12 }}
          >
            {FILTER_LABELS[filter]}
          </Text>
          <IconChevronDown size={16} color={muted} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Show</DropdownMenuLabel>
          {FILTERS.map((value) => (
            <DropdownMenuRadioItem key={value} checked={filter === value} onSelect={() => onFilterChange(value)}>
              {value === "unread" && unreadCount > 0 ? `Unread (${unreadCount})` : FILTER_LABELS[value]}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Group by</DropdownMenuLabel>
          {GROUPS.map((value) => (
            <DropdownMenuRadioItem key={value} checked={group === value} onSelect={() => onGroupChange(value)}>
              {GROUP_LABELS[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}
