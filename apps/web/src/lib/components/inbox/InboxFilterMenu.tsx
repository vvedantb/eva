"use client";

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@eva/ui";
import { IconChevronDown, IconFilter } from "@tabler/icons-react";
import { CountPop, countLabel } from "@/lib/components/ui/CountPop";
import {
  inboxFilters,
  isInboxFilter,
  type InboxFilter,
} from "@/lib/search-params";

const FILTER_LABELS: Record<InboxFilter, string> = {
  all: "All",
  unread: "Unread",
};

function UnreadCountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <Badge
      className={`h-4 min-w-4 justify-center rounded-full px-1 text-xs ${className ?? ""}`}
    >
      {count}
    </Badge>
  );
}

interface InboxFilterMenuProps {
  filter: InboxFilter;
  unreadCount: number;
  onChange: (filter: InboxFilter) => void;
}

/**
 * All / Unread filter for the inbox, built as the same radio dropdown the
 * sessions sidebar options menu uses. The unread count rides the Unread
 * option, and the trigger too while that filter is the active one.
 */
export function InboxFilterMenu({
  filter,
  unreadCount,
  onChange,
}: InboxFilterMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          // `h-7` to sit level with the Mark-all-read button beside it in the
          // header cluster, which is sized the same way.
          className="h-7 gap-1.5 px-2"
          aria-label={`Filter notifications: ${FILTER_LABELS[filter]}`}
        >
          <IconFilter size={16} />
          {FILTER_LABELS[filter]}
          <CountPop
            label={filter === "unread" ? countLabel(unreadCount) : null}
            className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/12 px-1 text-xs font-semibold tracking-[0.01em] text-primary"
          />
          <IconChevronDown size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuRadioGroup
          value={filter}
          onValueChange={(value) => {
            if (isInboxFilter(value)) onChange(value);
          }}
        >
          {inboxFilters.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {FILTER_LABELS[value]}
              {value === "unread" && unreadCount > 0 ? (
                <UnreadCountBadge count={unreadCount} className="ml-auto" />
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
