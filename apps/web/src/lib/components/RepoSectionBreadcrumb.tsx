"use client";

import { IconChevronRight } from "@tabler/icons-react";
import {
  BreadcrumbSwitcher,
  type BreadcrumbSwitcherItem,
} from "@/lib/components/BreadcrumbSwitcher";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";

interface RepoSectionBreadcrumbProps {
  sectionLabel: string;
  onSectionClick: () => void;
  entityLabel: string;
  /** When set, the leaf becomes a menu that switches between these siblings. */
  entitySwitcher?: {
    ariaLabel: string;
    emptyLabel: string;
    items: BreadcrumbSwitcherItem[];
  };
}

/** Single-line section breadcrumb: Section > entity (truncates / marquees on overflow). */
export function RepoSectionBreadcrumb({
  sectionLabel,
  onSectionClick,
  entityLabel,
  entitySwitcher,
}: RepoSectionBreadcrumbProps) {
  return (
    <div className="flex min-w-0 w-full items-center gap-1.5 overflow-hidden text-base">
      <button
        type="button"
        onClick={onSectionClick}
        className="shrink-0 whitespace-nowrap font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        {sectionLabel}
      </button>
      <IconChevronRight
        size={14}
        className="shrink-0 text-muted-foreground/50"
      />
      {entitySwitcher ? (
        <BreadcrumbSwitcher
          label={entityLabel}
          ariaLabel={entitySwitcher.ariaLabel}
          emptyLabel={entitySwitcher.emptyLabel}
          items={entitySwitcher.items}
        />
      ) : (
        <MarqueeOnHover className="min-w-0 flex-1 font-semibold">
          {entityLabel}
        </MarqueeOnHover>
      )}
    </div>
  );
}
