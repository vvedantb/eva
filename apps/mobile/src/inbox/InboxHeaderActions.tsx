import type { InboxGroup } from "@eva/shared/notificationGroups";
import { IconChecklist, IconChecks, IconChevronDown, IconFilter, type IconProps } from "@tabler/icons-react-native";
import { selectionHaptic } from "@vvedantb/native-ui/haptics";
import { SectionLabel, Sheet, SheetBody, SheetContent, SheetRow } from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { useState, type ComponentType } from "react";
import { Pressable, Text, View } from "react-native";
import { MenuDivider } from "@/ui/MenuSheet";
import { useScheme } from "@/ui/theme";

export type InboxFilter = "all" | "unread" | "archived";

const FILTERS: readonly InboxFilter[] = ["all", "unread", "archived"];
const GROUPS: readonly InboxGroup[] = ["day", "repo", "type", "urgency"];

/** The web `InboxFilterMenu` labels. */
const FILTER_LABELS: Record<InboxFilter, string> = { all: "All", unread: "Unread", archived: "Archived" };
const GROUP_LABELS: Record<InboxGroup, string> = { day: "Day", repo: "Repo", type: "Type", urgency: "Urgency" };

/**
 * A web `Button size="sm"` in the inbox header, icon only at phone width: a
 * 32-high pill (the web `sm`), `outline` (1px border, no fill) or `ghost` (neither), inside
 * a whole 44 target. The web `h-7` (28) pills 6 apart needed slop that
 * reached the neighbour; these targets sit side by side and need none.
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
      className="h-11 min-w-11 items-center justify-center active:opacity-70"
    >
      <View
        className="h-8 items-center justify-center rounded-full px-3"
        style={outline ? { borderWidth: 1, borderColor: tokens.color.border[scheme] } : undefined}
      >
        <Icon size={16} color={color} />
      </View>
    </Pressable>
  );
}

/**
 * The web inbox header actions at phone width: Mark all as read (only while
 * something is unread), Select, and the filter (Show and Group by, the web
 * `InboxFilterMenu`). The web filter is a dropdown; here it is a bottom
 * sheet in thumb reach, with the same groups and wording.
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
  const [filterOpen, setFilterOpen] = useState(false);
  // A new pick ticks; the sheet closes, as the web menu does.
  const pick = (changed: boolean, apply: () => void) => {
    if (changed) selectionHaptic();
    apply();
    setFilterOpen(false);
  };
  return (
    <View className="flex-row items-center">
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Filter notifications: ${FILTER_LABELS[filter]}, grouped by ${GROUP_LABELS[group]}`}
        accessibilityState={{ expanded: filterOpen }}
        onPress={() => setFilterOpen(true)}
        className="h-11 flex-row items-center gap-1.5 rounded-full px-2 active:opacity-70"
      >
        <IconFilter size={16} color={muted} />
        {/* The web button label is `text-xs` semibold with -0.01em tracking; 14 here, the phone floor for tappable text. */}
        <Text className="font-instrument-sans-semibold text-sm" style={{ color: muted, fontWeight: "600", letterSpacing: -0.14 }}>
          {FILTER_LABELS[filter]}
        </Text>
        <IconChevronDown size={16} color={muted} />
      </Pressable>
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent className="gap-3 px-3">
          <SheetBody>
            <FilterGroupLabel>Show</FilterGroupLabel>
            {FILTERS.map((value) => (
              <SheetRow
                key={value}
                title={value === "unread" && unreadCount > 0 ? `Unread (${unreadCount})` : FILTER_LABELS[value]}
                active={filter === value}
                onPress={() => pick(filter !== value, () => onFilterChange(value))}
              />
            ))}
            <MenuDivider />
            <FilterGroupLabel>Group by</FilterGroupLabel>
            {GROUPS.map((value) => (
              <SheetRow
                key={value}
                title={GROUP_LABELS[value]}
                active={group === value}
                onPress={() => pick(group !== value, () => onGroupChange(value))}
              />
            ))}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </View>
  );
}

/** A group heading in the filter sheet: the web `DropdownMenuLabel` (capitals, wide tracking, muted), in line with the row text. */
function FilterGroupLabel({ children }: { children: string }) {
  return (
    <SectionLabel uppercase className="px-4 pb-1 pt-2">
      {children}
    </SectionLabel>
  );
}
