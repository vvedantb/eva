import { IconChecks, IconChevronDown, IconFilter } from "@tabler/icons-react-native";
import { Button } from "@vvedantb/native-ui/button";
import {
  IconButton,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetRow,
  SheetTitle,
} from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { useState } from "react";
import { View } from "react-native";
import { useScheme } from "@/ui/theme";

export type InboxFilter = "all" | "unread" | "archived";

const FILTERS: readonly InboxFilter[] = ["all", "unread", "archived"];

/** The web `InboxFilterMenu` labels. */
const FILTER_LABELS: Record<InboxFilter, string> = { all: "All", unread: "Unread", archived: "Archived" };

/**
 * The web inbox header actions at phone width: Mark all as read (only while
 * something is unread), then the filter trigger ("All ⌄"). The web filter is a
 * dropdown; here it opens a sheet with the same three choices.
 */
export function InboxHeaderActions({
  filter,
  onFilterChange,
  unreadCount,
  onMarkAllRead,
}: {
  filter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  unreadCount: number;
  onMarkAllRead: () => void;
}) {
  const scheme = useScheme();
  const muted = tokens.color.muted[scheme];
  const [open, setOpen] = useState(false);
  return (
    <View className="flex-row items-center gap-1">
      {unreadCount > 0 ? (
        <IconButton icon={IconChecks} label="Mark all as read" size="sm" iconColor={muted} onPress={onMarkAllRead} />
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        fullWidth={false}
        accessibilityLabel={`Filter notifications: ${FILTER_LABELS[filter]}`}
        startContent={<IconFilter size={16} color={muted} />}
        endContent={<IconChevronDown size={16} color={muted} />}
        onPress={() => setOpen(true)}
      >
        {FILTER_LABELS[filter]}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Show</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {FILTERS.map((value) => (
              <SheetRow
                key={value}
                title={FILTER_LABELS[value]}
                detail={value === "unread" && unreadCount > 0 ? `${unreadCount} unread` : undefined}
                active={filter === value}
                onPress={() => {
                  onFilterChange(value);
                  setOpen(false);
                }}
              />
            ))}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </View>
  );
}
