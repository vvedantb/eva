"use client";

import * as React from "react";
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
} from "react-day-picker";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { cn } from "../utils/cn";
import { SURFACE_RADIUS_CLASS } from "../utils/surface-radius";
import { buttonVariants } from "./button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "border border-border bg-card p-3",
        SURFACE_RADIUS_CLASS,
        className,
      )}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "flex gap-4 flex-col md:flex-row relative",
          defaultClassNames.months,
        ),
        month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
        nav: cn(
          "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 text-muted-foreground aria-disabled:opacity-50 select-none",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 text-muted-foreground aria-disabled:opacity-50 select-none",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "flex items-center justify-center h-8 w-full px-8",
          defaultClassNames.month_caption,
        ),
        caption_label: cn(
          "select-none font-medium text-sm",
          defaultClassNames.caption_label,
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground flex-1 font-medium text-[0.76rem] uppercase tracking-[0.08em] select-none",
          "rounded-lg",
          defaultClassNames.weekday,
        ),
        week: cn("flex w-full mt-2", defaultClassNames.week),
        day: cn(
          "relative w-full h-full p-0 text-center aspect-square select-none",
          defaultClassNames.day,
        ),
        today: cn(
          "border border-primary/25 bg-primary/10 text-primary",
          "rounded-lg",
          defaultClassNames.today,
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside,
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled,
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({
          className: chevronClassName,
          orientation,
          ...chevronProps
        }) => {
          const Icon =
            orientation === "left" ? IconChevronLeft : IconChevronRight;
          return (
            <Icon
              className={cn("size-4", chevronClassName)}
              {...chevronProps}
            />
          );
        },
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      data-selected={modifiers.selected}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "h-8 w-8 p-0 font-normal",
        "data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:hover:bg-primary data-[selected=true]:hover:text-primary-foreground",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar };
