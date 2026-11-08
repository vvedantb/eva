import type { InboxGroup } from "@eva/shared/notificationGroups";
import { IconChecklist, IconChecks, IconChevronDown, IconFilter } from "@tabler/icons-react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

export type InboxFilter = "all" | "unread" | "archived";

const FILTERS: readonly InboxFilter[] = ["all", "unread", "archived"];
const GROUPS: readonly InboxGroup[] = ["day", "repo", "type", "urgency"];

/** The web `InboxFilterMenu` labels. */
const FILTER_LABELS: Record<InboxFilter, string> = { all: "All", unread: "Unread", archived: "Archived" };
const GROUP_LABELS: Record<InboxGroup, string> = { day: "Day", repo: "Repo", type: "Type", urgency: "Urgency" };

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
    <View className="flex-row items-center gap-1">
      {unreadCount > 0 ? (
        <IconButton icon={IconChecks} label="Mark all as read" size="sm" iconColor={muted} onPress={onMarkAllRead} />
      ) : null}
      <IconButton
        icon={IconChecklist}
        label={selecting ? "Cancel selection" : "Select notifications"}
        size="sm"
        iconColor={selecting ? tokens.color.foreground[scheme] : muted}
        onPress={onToggleSelecting}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          accessibilityLabel={`Filter notifications: ${FILTER_LABELS[filter]}, grouped by ${GROUP_LABELS[group]}`}
          hitSlop={6}
          className="h-8 flex-row items-center gap-1.5 rounded-full px-2 active:opacity-70"
        >
          <IconFilter size={16} color={muted} />
          <Text className="font-instrument-sans-medium text-sm" style={{ color: muted, fontWeight: "500" }}>
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
