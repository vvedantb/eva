"use client";

import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent, Button } from "@vvedantb/ui";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { IconCalendarClock } from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import {
  ScheduleDateTimePicker,
  ScheduleDateTimeActions,
  useScheduleDateTime,
} from "@/lib/components/ScheduleDateTimePicker";
import { withMutationToast } from "@/lib/utils/mutationToast";

interface SchedulePopoverProps {
  taskId: Id<"agentTasks">;
  scheduledAt?: number;
  disabled?: boolean;
  trigger?: React.ReactNode;
}

export function SchedulePopover({
  taskId,
  scheduledAt,
  disabled,
  trigger,
}: SchedulePopoverProps) {
  const { selectedDate, setSelectedDate, time, setTime, timestamp, reset } =
    useScheduleDateTime(scheduledAt);
  const [open, setOpen] = useState(false);

  const schedule = useMutation(api.agentTasks.scheduleExecution);
  const updateSchedule = useMutation(api.agentTasks.updateScheduledExecution);
  const cancelSchedule = useMutation(api.agentTasks.cancelScheduledExecution);

  const isScheduled = scheduledAt !== undefined;

  async function handleSchedule() {
    if (!timestamp) return;
    try {
      if (isScheduled) {
        await withMutationToast(
          updateSchedule({ id: taskId, scheduledAt: timestamp }),
          "Schedule updated",
          "Couldn't update schedule",
          "task-schedule-update",
        );
      } else {
        await withMutationToast(
          schedule({ id: taskId, scheduledAt: timestamp }),
          "Task scheduled",
          "Couldn't schedule task",
          "task-schedule",
        );
      }
      setOpen(false);
    } catch {
      // error toast already shown
    }
  }

  async function handleRemove() {
    try {
      await withMutationToast(
        cancelSchedule({ id: taskId }),
        "Schedule removed",
        "Couldn't remove schedule",
        "task-schedule-remove",
      );
      setOpen(false);
    } catch {
      // error toast already shown
    }
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      reset(scheduledAt);
    }
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <Button
            variant="secondary"
            disabled={disabled}
            className={isScheduled ? "text-primary" : undefined}
          >
            <IconCalendarClock size={18} />
            {isScheduled
              ? dayjs(scheduledAt).format("MMM D, h:mm A")
              : "Schedule"}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <ScheduleDateTimePicker
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          time={time}
          onTimeChange={setTime}
          timestamp={timestamp}
        />
        <ScheduleDateTimeActions
          isScheduled={isScheduled}
          timestamp={timestamp}
          onSchedule={handleSchedule}
          onRemove={handleRemove}
        />
      </PopoverContent>
    </Popover>
  );
}
