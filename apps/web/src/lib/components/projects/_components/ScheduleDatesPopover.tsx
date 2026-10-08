"use client";

import { useState } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Calendar,
  Button,
} from "@eva/ui";
import { IconCalendarPlus } from "@tabler/icons-react";

interface ScheduleDatesPopoverProps {
  onSchedule: (start: number, end: number) => void;
}

/** "Set dates" affordance: a range calendar that schedules a project onto the
 *  timeline once both ends are picked. Mirrors the date-picker pattern in
 *  ProjectDateRangeField. */
export function ScheduleDatesPopover({
  onSchedule,
}: ScheduleDatesPopoverProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({});

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <IconCalendarPlus size={14} />
          Set dates
        </Button>
      </PopoverTrigger>
      {/* Two months side by side are ~560px. `PopoverContent` already caps its
          width on a phone, so the calendar scrolls sideways inside the popover
          instead of pushing the page. */}
      <PopoverContent className="w-auto max-sm:overflow-x-auto p-0" align="end">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={range.from ? { from: range.from, to: range.to } : undefined}
          onSelect={(value) => {
            const next = { from: value?.from, to: value?.to };
            setRange(next);
            if (next.from && next.to) {
              onSchedule(next.from.getTime(), next.to.getTime());
              setOpen(false);
              setRange({});
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
