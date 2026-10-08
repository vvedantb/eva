"use client";

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@eva/ui";
import { IconChevronDown, IconFilter } from "@tabler/icons-react";
import { CountPop, countLabel } from "@/lib/components/ui/CountPop";
import {
  inboxFilters,
  inboxGroups,
  isInboxFilter,
  isInboxGroup,
  type InboxFilter,
  type InboxGroup,
} from "@/lib/search-params";

const FILTER_LABELS: Record<InboxFilter, string> = {
  all: "All",
  unread: "Unread",
  archived: "Archived",
};

const GROUP_LABELS: Record<InboxGroup, string> = {
  day: "Day",
  repo: "Repo",
  type: "Type",
  urgency: "Urgency",
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
  group: InboxGroup;
  unreadCount: number;
  onChange: (filter: InboxFilter) => void;
  onGroupChange: (group: InboxGroup) => void;
}

/**
 * The inbox's one dropdown: which notifications to show (All / Unread /
 * Archived) and how to section them (Day / Repo / Type). Both are radio groups
 * in the same menu — they are read together, and a second trigger beside this
 * one would crowd a header that already carries two buttons. The unread count
 * rides the Unread option, and the trigger too while that filter is active.
 */
export function InboxFilterMenu({
  filter,
  group,
  unreadCount,
  onChange,
  onGroupChange,
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
          aria-label={`Filter notifications: ${FILTER_LABELS[filter]}, grouped by ${GROUP_LABELS[group]}`}
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
        <DropdownMenuLabel>Show</DropdownMenuLabel>
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
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Group by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={group}
          onValueChange={(value) => {
            if (isInboxGroup(value)) onGroupChange(value);
          }}
        >
          {inboxGroups.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {GROUP_LABELS[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
