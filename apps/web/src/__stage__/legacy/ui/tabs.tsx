"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils/cn";
import { SURFACE_RADIUS_CLASS } from "../utils/surface-radius";
import { syncTabsPill } from "./tabsSliding";

const Tabs = TabsPrimitive.Root;

const tabsListVariants = cva(
  cn(
    // `max-w-full` + scroll: a tab list wide enough to overflow scrolls inside
    // its own box instead of widening the page. The bar is only 32-40px tall, so
    // the scrollbar is hidden rather than eating that height.
    // `justify-center-safe`, not `justify-center`: centred content that overflows
    // spills equally past both edges, and `scrollLeft` cannot go negative, so the
    // *leading* tabs become unreachable — the same bug the scroll was added to
    // fix, moved to the other end. Safe alignment falls back to start on overflow.
    "relative inline-flex items-center justify-center bg-background p-1 text-muted-foreground max-sm:max-w-full max-sm:justify-center-safe max-sm:overflow-x-auto max-sm:scrollbar-none",
    SURFACE_RADIUS_CLASS,
  ),
  {
    variants: {
      size: {
        default: "h-10",
        // Shrinks list + triggers together so callers don't size each TabsTrigger.
        sm: "h-8 [&_.t-tab]:px-2.5 [&_.t-tab]:py-1 [&_.t-tab]:text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> &
    VariantProps<typeof tabsListVariants>
>(({ className, children, size, ...props }, ref) => {
  const listRef = React.useRef<React.ComponentRef<
    typeof TabsPrimitive.List
  > | null>(null);
  const pillRef = React.useRef<HTMLSpanElement>(null);
  const pillReadyRef = React.useRef(false);

  const mergedRef = React.useCallback(
    (node: React.ComponentRef<typeof TabsPrimitive.List> | null) => {
      listRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  React.useLayoutEffect(() => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) {
      return;
    }

    const snap = () => syncTabsPill(list, pill, false);
    const animate = () => syncTabsPill(list, pill, true);

    snap();
    requestAnimationFrame(() => {
      pillReadyRef.current = true;
    });

    const onWindowResize = () => snap();
    window.addEventListener("resize", onWindowResize);

    const resizeObserver = new ResizeObserver(() => snap());
    resizeObserver.observe(list);

    const mutationObserver = new MutationObserver(() => {
      if (pillReadyRef.current) {
        animate();
      } else {
        snap();
      }
    });
    mutationObserver.observe(list, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-selected"],
    });

    return () => {
      window.removeEventListener("resize", onWindowResize);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <TabsPrimitive.List
      ref={mergedRef}
      className={cn(tabsListVariants({ size }), className)}
      {...props}
    >
      <span
        ref={pillRef}
        className="t-tabs-pill rounded-lg bg-card"
        aria-hidden="true"
      />
      {children}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const tabsBarVariants = cva(
  "flex shrink-0 flex-wrap items-center gap-2 border-b border-border",
  {
    variants: {
      size: {
        default: "px-3 py-2",
        sm: "px-2 py-1.5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

/**
 * Page- and panel-level tab strip: a `TabsList` sitting on the hairline that
 * divides it from the content below, with an optional trailing slot for
 * toolbar controls. Every primary tab bar should use this so the divider and
 * padding stay identical across surfaces; pass `className` only to override
 * padding (twMerge lets `px-4` win over the default `px-3`).
 *
 * Use `size="sm"` for nested panels (e.g. session Review). Not for folder-style
 * sandbox tabs — those own their own chrome.
 */
const TabsBar = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> &
    VariantProps<typeof tabsBarVariants> & { actions?: React.ReactNode }
>(({ className, children, actions, size, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(tabsBarVariants({ size }), className)}
    {...props}
  >
    {children}
    {actions ? (
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    ) : null}
  </div>
));
TabsBar.displayName = "TabsBar";

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "t-tab relative z-1 inline-flex cursor-pointer items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-medium ring-offset-background motion-press active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground",
      "rounded-lg",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-3 ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsBar, TabsList, TabsTrigger, TabsContent };
