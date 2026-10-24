"use client";

import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "../utils/cn";
import { SURFACE_RADIUS_CLASS } from "../utils/surface-radius";

/**
 * Radix defaults to 700ms open / 300ms close. Call sites had drifted to 0, 200,
 * 250 and 400 — the same gesture felt different depending on which chip you
 * hovered. One pair of values here; sites only override to opt out (0) or to
 * ask for a longer wait where the card is easy to trip over.
 */
export const HOVER_CARD_OPEN_DELAY_MS = 250;
export const HOVER_CARD_CLOSE_DELAY_MS = 100;

const HoverCard = ({
  openDelay = HOVER_CARD_OPEN_DELAY_MS,
  closeDelay = HOVER_CARD_CLOSE_DELAY_MS,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) => (
  <HoverCardPrimitive.Root
    openDelay={openDelay}
    closeDelay={closeDelay}
    {...props}
  />
);

const HoverCardTrigger = HoverCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-64 max-sm:max-w-[calc(100vw-2rem)] max-sm:max-h-[85dvh] max-sm:overflow-y-auto max-sm:scrollbar bg-popover/95 p-4 text-popover-foreground backdrop-blur-md smooth-shadow-ring-lg outline-hidden",
        SURFACE_RADIUS_CLASS,
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:data-[side=bottom]:slide-out-to-top-2 data-[state=closed]:data-[side=left]:slide-out-to-right-2 data-[state=closed]:data-[side=right]:slide-out-to-left-2 data-[state=closed]:data-[side=top]:slide-out-to-bottom-2 origin-(--radix-hover-card-content-transform-origin)",
        className,
      )}
      {...props}
    />
  </HoverCardPrimitive.Portal>
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
