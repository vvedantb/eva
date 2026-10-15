"use client";

import { useState, type ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@eva/ui";
import { IconChevronRight } from "@tabler/icons-react";

/**
 * One region of the Summary tab, as t3code draws it: a quiet heading that rides
 * the top of the scroll box like a diff's file header, so a long section can be
 * folded from wherever its body has been read to rather than only from where it
 * started. Opaque, because the rows it covers scroll beneath it.
 *
 * Heading controls (`actions`) sit beside the trigger rather than inside it, so
 * they stay independently usable.
 */
export function SummarySection({
  title,
  defaultOpen = true,
  actions,
  children,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section>
        <div className="sticky top-0 z-10 flex w-full items-center bg-background pr-4">
          <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 px-4 py-3 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            <span className="truncate">{title}</span>
            <IconChevronRight
              size={13}
              aria-hidden
              className="shrink-0 text-muted-foreground/60 transition-transform duration-[var(--motion-base)] group-data-[state=open]:rotate-90"
            />
          </CollapsibleTrigger>
          {actions}
        </div>
        <CollapsibleContent>
          <div className="px-4 pb-4">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

/**
 * A labelled fact at the top of Summary: a fixed 6rem label column, then the
 * value. Reviewers, assignees, and labels line up down one edge.
 */
export function SummaryMetaRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-7 min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="min-w-0 text-foreground">{children}</span>
    </div>
  );
}
