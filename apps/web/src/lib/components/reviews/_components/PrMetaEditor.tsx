"use client";

import { useState } from "react";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  CrossfadeIcon,
  Spinner,
} from "@eva/ui";
import { IconCheck, IconPencil } from "@tabler/icons-react";

export interface PrMetaOption {
  /** Sent to GitHub — a login, or a label name. */
  value: string;
  label: string;
  /** An avatar or a colour swatch, rendered before the label. */
  adornment?: React.ReactNode;
}

/**
 * The pencil on a metadata section, and the picker behind it: a searchable list
 * of everything the field can hold, with what it holds now ticked.
 *
 * One component for reviewers, assignees, and labels because the interaction is
 * identical — a set of candidates, a multi-select, a whole-set save. Three
 * bespoke popovers would drift in three directions, and the differences between
 * these fields live entirely in the backend action each one calls.
 *
 * Saves per click rather than on close. A picker with a Save button asks the
 * reader to remember that the change has not happened yet, and each of these is
 * one request that either lands or reports why it did not; the popover stays open
 * so several can be toggled in a row.
 */
export function PrMetaEditor({
  title,
  selected,
  options,
  loading,
  saving,
  onOpen,
  onToggle,
  emptyMessage,
}: {
  /** Names the field in the trigger's label and the search placeholder. */
  title: string;
  selected: readonly string[];
  options: readonly PrMetaOption[];
  /** True while the candidate list is still being fetched. */
  loading: boolean;
  saving: boolean;
  /** Called when the popover opens, so candidates are fetched on demand. */
  onOpen: () => void;
  /** Given the whole next set, because that is what GitHub takes. */
  onToggle: (next: string[]) => void;
  emptyMessage: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onOpen();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="-my-1 size-6 p-0 text-muted-foreground"
          aria-label={`Edit ${title.toLowerCase()}`}
          title={`Edit ${title.toLowerCase()}`}
        >
          <CrossfadeIcon
            show={saving}
            trueKey="loading"
            falseKey="idle"
            variant="soft"
            className="relative flex size-3.5 items-center justify-center"
            whenTrue={<Spinner size="sm" />}
            whenFalse={<IconPencil size={13} aria-hidden />}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={`Search ${title.toLowerCase()}…`} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyMessage}</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => {
                    const isSelected = selected.includes(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        onSelect={() =>
                          onToggle(
                            isSelected
                              ? selected.filter(
                                  (value) => value !== option.value,
                                )
                              : [...selected, option.value],
                          )
                        }
                      >
                        {option.adornment}
                        <span className="min-w-0 truncate">{option.label}</span>
                        {isSelected ? (
                          <IconCheck
                            size={14}
                            className="ml-auto shrink-0"
                            aria-hidden
                          />
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
