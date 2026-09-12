"use client";

import { Slot } from "@radix-ui/react-slot";
import { Skeleton, cn } from "@eva/ui";
import { IconChevronRight } from "@tabler/icons-react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";

/**
 * Sandbox Artifacts / Documents chrome.
 *
 * The pane itself is `bg-card`. A muted wash behind the list lets each row
 * sit as a real surface (shadow ring, not a hairline) so cards no longer
 * vanish into the same fill or hover as flush pills.
 */
const CARD_SHADOW =
  "shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_4px_0_rgba(0,0,0,0.04)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]";
const CARD_SHADOW_HOVER =
  "hover:shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_-1px_rgba(0,0,0,0.08),0_2px_4px_0_rgba(0,0,0,0.06)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.13)]";

export function SessionSourcePane({
  title,
  count,
  viewAll,
  loading,
  children,
}: {
  title: string;
  count?: number;
  viewAll: ReactNode;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-balance text-foreground">
            {title}
          </p>
          {count !== undefined ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
        </div>
        {viewAll}
      </div>
      <div className="scrollbar scroll-fade min-h-0 flex-1 overflow-y-auto bg-muted/40">
        {loading ? (
          <div
            className="flex flex-col gap-1.5 p-2"
            aria-busy="true"
            aria-label="Loading"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2.5 rounded-surface bg-card p-2.5",
                  CARD_SHADOW,
                )}
              >
                <Skeleton className="size-9 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 pt-0.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="mt-1.5 h-3 w-full" />
                </div>
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
  "hit-target motion-press inline-flex shrink-0 items-center gap-0.5 rounded-md py-1 pl-2 pr-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.96]";

export function SessionSourceEmpty({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-[13px] font-medium tracking-[-0.01em] text-balance text-foreground">
        {title}
      </p>
      <p className="mt-1 max-w-[16rem] text-pretty text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function SessionSourceList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5 p-2">{children}</div>;
}

export const SessionSourceRow = forwardRef<
  HTMLDivElement,
  {
    title: string;
    preview?: string | null;
    timeLabel: string;
    icon: ReactNode;
    link: ReactElement;
    trailing?: ReactNode;
  } & Omit<ComponentPropsWithoutRef<"div">, "title">
>(function SessionSourceRow(
  { title, preview, timeLabel, icon, link, trailing, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        "group relative rounded-surface bg-card motion-press active:scale-[0.96]",
        CARD_SHADOW,
        CARD_SHADOW_HOVER,
        "has-[[data-slot=row-control]:focus-visible]:ring-2 has-[[data-slot=row-control]:focus-visible]:ring-ring/35",
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
      <div className="relative flex items-start gap-2.5 p-2.5">
        <span className="mt-px flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <MarqueeOnHover className="min-w-0 flex-1 text-[13px] font-medium leading-5 tracking-[-0.01em] text-foreground">
              {title}
            </MarqueeOnHover>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {timeLabel}
            </span>
            {trailing}
          </span>
          {preview ? (
            <p className="mt-0.5 line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground">
              {preview}
            </p>
          ) : null}
        </span>
        <IconChevronRight
          size={14}
          aria-hidden
          className="mt-1.5 shrink-0 text-muted-foreground opacity-0 transition-[opacity,translate] duration-[var(--motion-fast)] ease-[var(--motion-ease-out)] group-hover:translate-x-0.5 group-hover:opacity-100"
        />
      </div>
    </div>
  );
});
