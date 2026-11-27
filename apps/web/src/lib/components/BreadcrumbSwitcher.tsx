"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MarqueeOnHover,
} from "@vvedantb/ui";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { DynamicLink } from "@/lib/components/DynamicLink";

export interface BreadcrumbSwitcherItem {
  key: string;
  prefix?: string;
  label: string;
  href: string;
  isActive: boolean;
}

const MAX_ITEMS = 20;

function capItems(items: BreadcrumbSwitcherItem[]): BreadcrumbSwitcherItem[] {
  if (items.length <= MAX_ITEMS) return items;
  const head = items.slice(0, MAX_ITEMS);
  if (head.some((item) => item.isActive)) return head;
  const active = items.find((item) => item.isActive);
  if (active === undefined) return head;
  return [active, ...head.slice(0, MAX_ITEMS - 1)];
}

export interface BreadcrumbSwitcherProps {
  label: string;
  ariaLabel: string;
  emptyLabel: string;
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
