"use client";

import { useState } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Command,
  CommandList,
  CommandGroup,
  CommandItem,
  cn,
  CrossfadeIconSlot,
} from "@eva/ui";
import { IconCheck } from "@tabler/icons-react";
import { PriorityIcon } from "./PriorityIcon";
import { PRIORITY_LABELS, PRIORITY_ORDER, type Priority } from "./priorityMeta";

interface PriorityPickerProps {
  value: Priority | undefined;
  onChange: (priority: Priority | undefined) => void;
  compact?: boolean;
  className?: string;
}

const NO_PRIORITY_VALUE = "__no_priority__";

export function PriorityPicker({
  value,
  onChange,
  compact = false,
  className,
}: PriorityPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            // `min-h-10` rather than a height: the trigger is ~26px
            // tall, and callers that pass their own `h-*` (the quick-task
            // option chips) must keep it from `sm` up.
            "inline-flex max-sm:min-h-10 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground",
            className,
          )}
          aria-label={`Priority: ${value ? PRIORITY_LABELS[value] : "No priority"}`}
        >
          <CrossfadeIconSlot
            iconKey={value ?? "none"}
            className="relative flex size-3.5 items-center justify-center"
          >
            <PriorityIcon level={value} size={14} />
          </CrossfadeIconSlot>
          {!compact && (
            <span className={value ? "text-foreground" : ""}>
              {value ? PRIORITY_LABELS[value] : "Priority"}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-0">
        <Command>
          <CommandList>
            <CommandGroup>
              <CommandItem
                value={NO_PRIORITY_VALUE}
                onSelect={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
              >
                <PriorityIcon level={undefined} size={14} />
                No priority
                {value === undefined && (
                  <IconCheck size={14} className="ml-auto" />
                )}
              </CommandItem>
              {PRIORITY_ORDER.map((p) => (
                <CommandItem
                  key={p}
                  value={p}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                >
                  <PriorityIcon level={p} size={14} />
                  {PRIORITY_LABELS[p]}
                  {value === p && <IconCheck size={14} className="ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
