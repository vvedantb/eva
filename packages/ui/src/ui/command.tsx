"use client";

import * as React from "react";
import { type DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { IconSearch } from "@tabler/icons-react";

import { cn } from "../utils/cn";
import { SURFACE_RADIUS_CLASS } from "../utils/surface-radius";
import { Dialog, DialogContent } from "./dialog";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden border border-border bg-popover/95 text-popover-foreground backdrop-blur-md",
      SURFACE_RADIUS_CLASS,
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

const CommandDialog = ({ children, ...props }: DialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0">
        <Command className="**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.08em] **:[[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-1 **:[[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:size-5 **:[[cmdk-input]]:h-12 **:[[cmdk-item]]:px-3 **:[[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:size-4">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div
    className="flex items-center gap-2 border-b border-border px-3.5"
    cmdk-input-wrapper=""
  >
    <IconSearch className="size-4 shrink-0 text-muted-foreground" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        // 16px below `sm` — see the note in input.tsx.
        "flex h-11 w-full max-sm:min-w-0 rounded-none bg-transparent py-3 text-base sm:text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  </div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn(
      // `dvh` cap so the list never pushes the palette past the visible area on
      // a phone, where 320px of results plus the input exceeds the keyboard-free
      // space.
      "max-h-[320px] max-sm:max-h-[60dvh] overflow-y-auto overflow-x-hidden scrollbar",
      className,
    )}
    {...props}
  />
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm"
    {...props}
  />
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-2xs **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.08em] **:[[cmdk-group-heading]]:text-muted-foreground",
      className,
    )}
    {...props}
  />
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 h-px bg-border", className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer gap-2 select-none items-center px-2.5 py-2 max-sm:min-h-10 text-sm outline-hidden motion-press active:scale-[0.98] data-[disabled=true]:pointer-events-none data-[selected=true]:bg-muted data-[selected=true]:text-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      "rounded-lg",
      className,
    )}
    {...props}
  />
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
};
CommandShortcut.displayName = "CommandShortcut";

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
