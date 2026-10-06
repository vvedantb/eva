"use client";

import { useState } from "react";
import {
  Badge,
  Checkbox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@eva/ui";
import { IconPlus } from "@tabler/icons-react";
import {
  FIELD_ROW_CLASS,
  FIELD_TEXT_CLASS,
} from "@/lib/components/fields/FieldsSection";

interface LabelsFieldProps {
  /** Labels on the record. */
  tags: string[] | undefined;
  /** Every label already used in this repo — the pick list. */
  allTags: string[];
  onChange: (tags: string[]) => void;
}

/**
 * Labels row for detail panels: badges when there are labels, an "Add tag..."
 * affordance when there are none. Clicking the row opens one picker that both
 * adds and removes, so there is no per-badge remove button to aim at.
 */
export function LabelsField({ tags, allTags, onChange }: LabelsFieldProps) {
  const [search, setSearch] = useState("");
  const current = tags ?? [];
  const selected = new Set(current);
  // Selected first, then the rest of the repo's labels — mirrors the picker
  // order people expect from a checkbox list.
  const options = [
    ...current,
    ...allTags.filter((tag) => !selected.has(tag)),
  ].filter((tag, index, list) => list.indexOf(tag) === index);

  const toggle = (tag: string) => {
    onChange(
      selected.has(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );
  };

  const create = (raw: string) => {
    const value = raw.trim();
    setSearch("");
    if (!value || selected.has(value)) return;
    onChange([...current, value]);
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change or add labels"
          className={`${FIELD_ROW_CLASS} w-full flex-wrap gap-1 text-left ${FIELD_TEXT_CLASS}`}
        >
          {current.length === 0 ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <IconPlus size={14} />
              Add tag...
            </span>
          ) : (
            <>
              {current.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className={`h-6 ${FIELD_TEXT_CLASS}`}
                >
                  {tag}
                </Badge>
              ))}
              <IconPlus size={14} className="shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command className="border-0 bg-transparent backdrop-blur-none">
          <CommandInput
            placeholder="Change or add labels..."
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && search.trim()) {
                e.preventDefault();
                create(search);
              }
            }}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => create(search)}
                >
                  Create &quot;{search.trim()}&quot;
                </button>
              ) : (
                "No labels"
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((tag) => (
                <CommandItem
                  key={tag}
                  value={tag}
                  onSelect={() => toggle(tag)}
                  className="gap-2"
                >
                  <Checkbox
                    checked={selected.has(tag)}
                    tabIndex={-1}
                    aria-hidden
                    className="pointer-events-none"
                  />
                  <span className="truncate">{tag}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
