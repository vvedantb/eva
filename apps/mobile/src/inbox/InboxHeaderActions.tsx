import { EVA_THEME } from "@eva/shared/evaTheme";
import type { InboxGroup } from "@eva/shared/notificationGroups";
import { IconChecklist, IconChecks, IconChevronDown, IconFilter } from "@tabler/icons-react-native";
import { selectionHaptic } from "@vvedantb/native-ui/haptics";
import { HeaderIconButton, SectionLabel, Sheet, SheetBody, SheetContent, SheetRow, MenuDivider } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { headerButtonSurface } from "@/ui/HeaderRail";
import { useScheme } from "@/ui/theme";

export type InboxFilter = "all" | "unread" | "archived";

const FILTERS: readonly InboxFilter[] = ["all", "unread", "archived"];
const GROUPS: readonly InboxGroup[] = ["day", "repo", "type", "urgency"];

const FILTER_LABELS: Record<InboxFilter, string> = { all: "All", unread: "Unread", archived: "Archived" };
const GROUP_LABELS: Record<InboxGroup, string> = { day: "Day", repo: "Repo", type: "Type", urgency: "Urgency" };

/**
 * The web inbox header actions at phone width: Mark all as read (only while
 * something is unread), Select (a long press on a row starts it too), and the filter (Show and Group by, the web
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
  onSelect,
}: {
  filter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  group: InboxGroup;
  onGroupChange: (group: InboxGroup) => void;
  unreadCount: number;
  onMarkAllRead: () => void;
  onSelect: () => void;
}) {
  const scheme = useScheme();
  const foreground = EVA_THEME[scheme].foreground;
  const largerText = useLargerText();
  const [filterOpen, setFilterOpen] = useState(false);
  const pick = (changed: boolean, apply: () => void) => {
    if (changed) selectionHaptic();
    apply();
    setFilterOpen(false);
  };
  return (
    <View className="flex-row items-center gap-2">
      {unreadCount > 0 ? (
        <HeaderIconButton label="Mark all as read" onPress={onMarkAllRead}>
          <IconChecks size={18} color={foreground} />
        </HeaderIconButton>
      ) : null}
      <HeaderIconButton label="Select notifications" onPress={onSelect}>
        <IconChecklist size={18} color={foreground} />
      </HeaderIconButton>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Filter notifications: ${FILTER_LABELS[filter]}, grouped by ${GROUP_LABELS[group]}`}
        accessibilityState={{ expanded: filterOpen }}
        onPress={() => setFilterOpen(true)}
        hitSlop={8}
        className={`${largerText ? "h-14" : "h-12"} flex-row items-center gap-1.5 rounded-full border px-3 active:opacity-70`}
        style={headerButtonSurface(scheme)}
      >
        <IconFilter size={18} color={foreground} />
        <Text className="font-instrument-sans-semibold text-sm" style={{ color: foreground, fontWeight: "600", letterSpacing: -0.14 }}>
          {FILTER_LABELS[filter]}
        </Text>
        <IconChevronDown size={16} color={foreground} />
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

function FilterGroupLabel({ children }: { children: string }) {
  return (
    <SectionLabel uppercase className="px-4 pb-1 pt-2">
      {children}
    </SectionLabel>
  );
}
