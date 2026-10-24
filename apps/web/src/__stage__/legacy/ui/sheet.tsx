"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { IconX } from "@tabler/icons-react";
import { cn } from "../utils/cn";

const Sheet = DialogPrimitive.Root;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetTrigger = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Trigger
    ref={ref}
    className={cn("cursor-pointer", className)}
    {...props}
  />
));
SheetTrigger.displayName = DialogPrimitive.Trigger.displayName;

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: "left" | "right";
    hideCloseButton?: boolean;
  }
>(({ className, children, side = "left", hideCloseButton, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // `dvh` + a viewport width guard so the panel cannot exceed the visible
        // area on a phone when a caller forgets to size it.
        "fixed z-50 flex flex-col h-full top-0 max-sm:h-dvh max-sm:max-w-[100vw] border-border bg-card smooth-shadow-ring-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out",
        side === "left" &&
          "left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        side === "right" &&
          "right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        className,
      )}
      {...props}
    >
      {children}
      {!hideCloseButton && (
        <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground motion-press active:scale-[0.94] hover:text-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 after:absolute after:inset-[-6px]">
          <IconX className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = "SheetContent";

const SheetTitle = DialogPrimitive.Title;

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetOverlay,
  SheetTitle,
};
