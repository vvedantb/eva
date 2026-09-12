"use client";

import { Slot } from "@radix-ui/react-slot";
import { Skeleton, cn } from "@eva/ui";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * Shared chrome for the sandbox Artifacts and Documents panes.
 *
 * `ListRow` / `bg-card` tiles sit on the pane's own `bg-card`, so they either
 * vanish or hover as floating pills. These rows are flush, hairline-divided,
 * and match the doc history / comments side panels instead.
 */
export function SessionSourcePane({
  countLabel,
  viewAll,
  loading,
  children,
}: {
  countLabel: string;
  viewAll: ReactNode;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-foreground">
          {countLabel}
        </p>
        {viewAll}
      </div>
      <div className="scrollbar scroll-fade min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col" aria-busy="true" aria-label="Loading">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border-b border-border px-3 py-2.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="mt-1.5 h-3 w-full" />
              </div>
            ))}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export const sessionSourceViewAllClass =
  "flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground";

export function SessionSourceEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-[13px] font-medium tracking-[-0.01em] text-foreground">
        {title}
      </p>
      <p className="mt-1 max-w-[16rem] text-pretty text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export const SessionSourceRow = forwardRef<
  HTMLDivElement,
  {
    title: string;
    preview?: string | null;
    timeLabel: string;
    link: ReactElement;
    trailing?: ReactNode;
  } & Omit<ComponentPropsWithoutRef<"div">, "title">
>(function SessionSourceRow(
  { title, preview, timeLabel, link, trailing, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        "group relative border-b border-border last:border-b-0 hover:bg-accent/50",
        className,
      )}
    >
      <Slot
        data-slot="row-control"
        aria-label={title}
        className="absolute inset-0 z-1 cursor-pointer focus-visible:outline-hidden"
      >
        {link}
      </Slot>
      <div className="relative px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.01em] text-foreground">
            {title}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {timeLabel}
          </span>
          {trailing}
        </div>
        {preview ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {preview}
          </p>
        ) : null}
      </div>
    </div>
  );
});
