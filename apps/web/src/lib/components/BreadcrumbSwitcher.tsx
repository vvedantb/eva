"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@eva/ui";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";

export interface BreadcrumbSwitcherItem {
  key: string;
  /** Muted leading text (e.g. a task's `#12`). */
  prefix?: string;
  label: string;
  /** In-app path, already run through `toInternalRepoHref`. */
  href: string;
  isActive: boolean;
}

/** The menu is a shortcut, not a browser — the list page stays the full index. */
const MAX_ITEMS = 20;

/** Leading slice of an already-ordered list, with the open entity kept in it. */
function capItems(items: BreadcrumbSwitcherItem[]): BreadcrumbSwitcherItem[] {
  if (items.length <= MAX_ITEMS) return items;
  const head = items.slice(0, MAX_ITEMS);
  if (head.some((item) => item.isActive)) return head;
  const active = items.find((item) => item.isActive);
  if (active === undefined) return head;
  return [active, ...head.slice(0, MAX_ITEMS - 1)];
}

export interface BreadcrumbSwitcherProps {
  /** Leaf text for the open entity. */
  label: string;
  ariaLabel: string;
  emptyLabel: string;
  /** Siblings in the order they should be offered (most recent first). */
  items: BreadcrumbSwitcherItem[];
}

/**
 * Breadcrumb leaf that doubles as a switcher: the open entity's name opens a
 * menu of its siblings so you can jump sideways without going back to the list.
 * Shared by the project and quick task headers.
 */
export function BreadcrumbSwitcher({
  label,
  ariaLabel,
  emptyLabel,
  items,
}: BreadcrumbSwitcherProps) {
  const visible = capItems(items);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="motion-press -ml-1.5 flex min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left font-semibold hover:bg-muted active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {/* Hugs the label so the chevron reads as part of the name, not a
              far-right control: no `flex-1` here, and `min-w-0` lets a long
              name shrink and ellipsise instead of pushing the chevron away. */}
          <MarqueeOnHover className="min-w-0">{label}</MarqueeOnHover>
          <IconChevronDown
            size={14}
            className="shrink-0 text-muted-foreground"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-72 overflow-y-auto"
      >
        {visible.length === 0 ? (
          <div className="px-2.5 py-2 text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          visible.map((item) => (
            <DropdownMenuItem key={item.key} asChild>
              <DynamicLink
                to={item.href}
                // Sibling pages share the section's filter/sort search params —
                // keep them so switching does not reset the list behind you.
                search={true}
                className="flex items-center gap-2"
              >
                {item.prefix ? (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {item.prefix}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.isActive ? (
                  <IconCheck
                    size={14}
                    className="ml-auto shrink-0 text-primary"
                  />
                ) : null}
              </DynamicLink>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
