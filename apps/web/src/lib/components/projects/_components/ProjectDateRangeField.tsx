"use client";

import { Popover, PopoverTrigger, PopoverContent, Calendar } from "@eva/ui";
import { IconCalendarEvent } from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import {
  FIELD_ROW_CLASS,
  FIELD_TEXT_CLASS,
} from "@/lib/components/fields/FieldsSection";

/** One end of the range: its date (or placeholder) behind a calendar popover. */
function DateEnd({
  value,
  placeholder,
  format,
  onChange,
}: {
  value: number | undefined;
  placeholder: string;
  format: string;
  onChange: (epoch: number | null) => void;
}) {
  const selected = value ? new Date(value) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`rounded px-0.5 transition-colors hover:text-foreground ${selected ? "" : "text-muted-foreground"}`}
        >
          {selected ? dayjs(selected).format(format) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => onChange(date ? date.getTime() : null)}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Project start and end as one "start → end" row. Each end keeps its own
 * calendar popover, so either date can still be set or cleared on its own.
 * The year is written once when both ends share it, and a project with no end
 * date yet reads as "ongoing".
 */
export function ProjectDateRangeField({
  start,
  end,
  onStartChange,
  onEndChange,
}: {
  start: number | undefined;
  end: number | undefined;
  onStartChange: (epoch: number | null) => void;
  onEndChange: (epoch: number | null) => void;
}) {
  const sharesYear =
    start !== undefined &&
    end !== undefined &&
    dayjs(start).year() === dayjs(end).year();

  return (
    <div className={`${FIELD_ROW_CLASS} gap-1 ${FIELD_TEXT_CLASS}`}>
      <IconCalendarEvent
        size={14}
        className="mr-0.5 shrink-0 text-muted-foreground"
      />
      <DateEnd
        value={start}
        placeholder="Start date"
        format={sharesYear ? "MMM D" : "MMM D, YYYY"}
        onChange={onStartChange}
      />
      <span className="text-muted-foreground">→</span>
      <DateEnd
        value={end}
        placeholder={start === undefined ? "End date" : "Ongoing"}
        format="MMM D, YYYY"
        onChange={onEndChange}
      />
    </div>
  );
}
