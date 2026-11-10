"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Spinner,
} from "@vvedantb/ui";
import dayjs from "@eva/shared/dates";
import {
  ScheduleDateTimePicker,
  useScheduleDateTime,
} from "@/lib/components/ScheduleDateTimePicker";

interface ScheduleTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTaskIds: Set<Id<"agentTasks">>;
  onSuccess: () => void;
}

export function ScheduleTasksModal({
  isOpen,
  onClose,
  selectedTaskIds,
  onSuccess,
}: ScheduleTasksModalProps) {
  "use no memo";
  const schedule = useMutation(api.agentTasks.scheduleExecution);
  const updateSchedule = useMutation(api.agentTasks.updateScheduledExecution);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selectedDate, setSelectedDate, time, setTime, timestamp, reset } =
    useScheduleDateTime();

  const count = selectedTaskIds.size;

  function handleClose() {
    setError(null);
    reset();
    onClose();
  }

  const handleSchedule = async () => {
    if (!timestamp) return;
    setIsLoading(true);
    setError(null);
    try {
      const taskIds = [...selectedTaskIds];
      const results = await Promise.all(
        taskIds.map(async (id) => {
          try {
            await schedule({ id, scheduledAt: timestamp });
            return true;
          } catch {
            try {
              await updateSchedule({ id, scheduledAt: timestamp });
              return true;
            } catch (updateErr) {
              console.error(`Failed to schedule task ${id}:`, updateErr);
              return false;
            }
          }
        }),
      );
      const scheduledCount = results.filter(Boolean).length;
      if (scheduledCount === count) {
        setIsLoading(false);
        onSuccess();
        handleClose();
        return;
      }
      if (scheduledCount === 0) {
        setError(
          "Failed to schedule any selected tasks. Only todo tasks can be scheduled.",
        );
      } else {
        setError(
          `Scheduled ${scheduledCount} of ${count} tasks. ${count - scheduledCount} failed (may not be in todo status).`,
        );
      }
    } catch (err) {
      console.error("Failed to schedule tasks:", err);
      setError("Failed to schedule selected tasks.");
    }
    setIsLoading(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Schedule {count} task{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Set a date and time to run the selected task
            {count === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>
        <ScheduleDateTimePicker
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          time={time}
          onTimeChange={setTime}
          timestamp={timestamp}
          calendarClassName="border rounded-control shadow-none mx-auto"
          showPreview={false}
        />
        {timestamp && (
          <p className="text-sm text-muted-foreground px-1">
            Tasks will run at{" "}
            <span className="font-medium text-foreground">
              {dayjs(timestamp).format("MMM D, h:mm A")}
            </span>
          </p>
        )}
        {error && <p className="text-sm text-destructive px-1">{error}</p>}
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={isLoading || !timestamp}>
            {isLoading && <Spinner size="sm" />}
            Schedule {count} task{count === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
