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

interface ScheduleBuildPopoverProps {
  projectId: Id<"projects">;
  scheduledBuildAt?: number;
  disabled?: boolean;
  trigger?: React.ReactNode;
}

export function ScheduleBuildPopover({
  projectId,
  scheduledBuildAt,
  disabled,
  trigger,
}: ScheduleBuildPopoverProps) {
  const { selectedDate, setSelectedDate, time, setTime, timestamp, reset } =
    useScheduleDateTime(scheduledBuildAt);
  const [open, setOpen] = useState(false);

  const schedule = useMutation(api.buildWorkflow.scheduleBuild);
  const updateSchedule = useMutation(api.buildWorkflow.updateScheduledBuild);
  const cancelSchedule = useMutation(api.buildWorkflow.cancelScheduledBuild);

  const isScheduled = scheduledBuildAt !== undefined;

  async function handleSchedule() {
    if (!timestamp) return;
    try {
      if (isScheduled) {
        await withMutationToast(
          updateSchedule({ projectId, scheduledAt: timestamp }),
          "Build schedule updated",
          "Couldn't update build schedule",
          "build-schedule-update",
        );
      } else {
        await withMutationToast(
          schedule({ projectId, scheduledAt: timestamp }),
          "Build scheduled",
          "Couldn't schedule build",
          "build-schedule",
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
        cancelSchedule({ projectId }),
        "Build schedule removed",
        "Couldn't remove build schedule",
        "build-schedule-remove",
      );
      setOpen(false);
    } catch {
      // error toast already shown
    }
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      reset(scheduledBuildAt);
    }
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            className={isScheduled ? "text-primary" : undefined}
          >
            <IconCalendarClock size={16} />
            {isScheduled
              ? `Scheduled: ${dayjs(scheduledBuildAt).format("MMM D, h:mm A")}`
              : "Schedule Build"}
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
          scheduleLabel="Schedule"
          updateLabel="Update"
        />
      </PopoverContent>
    </Popover>
  );
}
