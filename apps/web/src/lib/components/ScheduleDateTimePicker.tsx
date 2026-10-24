"use client";

import { useState } from "react";
import { Calendar, Button } from "@vvedantb/ui";
import dayjs from "@eva/shared/dates";

function parseTimestamp(
  selectedDate: Date | undefined,
  time: string,
): number | null {
  if (!selectedDate) return null;
  const parts = time.split(":");
  if (parts.length < 2) return null;
  const [hours, minutes] = parts.map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;
  const combined = dayjs(selectedDate)
    .hour(hours)
    .minute(minutes)
    .second(0)
    .millisecond(0);
  if (combined.valueOf() <= Date.now()) return null;
  return combined.valueOf();
}

interface ScheduleDateTimePickerProps {
  selectedDate: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  time: string;
  onTimeChange: (time: string) => void;
  timestamp: number | null;
  calendarClassName?: string;
  showPreview?: boolean;
}

export function useScheduleDateTime(initialTimestamp?: number) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() =>
    initialTimestamp ? new Date(initialTimestamp) : new Date(),
  );
  const [time, setTime] = useState(() =>
    initialTimestamp
      ? dayjs(initialTimestamp).format("HH:mm")
      : dayjs().format("HH:mm"),
  );

  const timestamp = parseTimestamp(selectedDate, time);

  const reset = (ts?: number) => {
    setSelectedDate(ts ? new Date(ts) : new Date());
    setTime(ts ? dayjs(ts).format("HH:mm") : dayjs().format("HH:mm"));
  };

  return {
    selectedDate,
    setSelectedDate,
    time,
    setTime,
    timestamp,
    reset,
  };
}

export function ScheduleDateTimePicker({
  selectedDate,
  onDateChange,
  time,
  onTimeChange,
  timestamp,
  calendarClassName = "border-0 shadow-none",
  showPreview = true,
}: ScheduleDateTimePickerProps) {
  return (
    <>
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={onDateChange}
        disabled={{ before: new Date() }}
        className={calendarClassName}
      />
      <div className="border-t px-3 py-2 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Time
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="flex-1 rounded-control border border-input bg-background px-2 py-1 text-sm"
          />
        </label>
        {showPreview && timestamp && (
          <p className="text-xs text-muted-foreground">
            Scheduled for{" "}
            <span className="font-medium text-foreground">
              {dayjs(timestamp).format("MMM D, h:mm A")}
            </span>
          </p>
        )}
      </div>
    </>
  );
}

interface ScheduleDateTimeActionsProps {
  isScheduled: boolean;
  timestamp: number | null;
  onSchedule: () => void;
  onRemove?: () => void;
  scheduleLabel?: string;
  updateLabel?: string;
}

export function ScheduleDateTimeActions({
  isScheduled,
  timestamp,
  onSchedule,
  onRemove,
  scheduleLabel = "Schedule",
  updateLabel = "Update",
}: ScheduleDateTimeActionsProps) {
  return (
    <div className="flex gap-2 px-3 pb-2">
      {isScheduled ? (
        <>
          {onRemove && (
            <Button
              size="sm"
              variant="destructive"
              onClick={onRemove}
              className="flex-1"
            >
              Remove
            </Button>
          )}
          <Button
            size="sm"
            onClick={onSchedule}
            disabled={!timestamp}
            className="flex-1"
          >
            {updateLabel}
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          onClick={onSchedule}
          disabled={!timestamp}
          className="w-full"
        >
          {scheduleLabel}
        </Button>
      )}
    </div>
  );
}
