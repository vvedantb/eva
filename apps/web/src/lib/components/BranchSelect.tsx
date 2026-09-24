"use client";

import { useState, useEffect, useRef } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Spinner,
  cn,
} from "@eva/ui";
import { IconGitBranch, IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useBranches } from "@/lib/hooks/useBranches";

interface BranchSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function BranchSelect({
  value,
  onValueChange,
  className,
  disabled,
  placeholder = "Select a branch",
}: BranchSelectProps) {
  const { repo } = useRepo();
  const [open, setOpen] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { branches, isLoading } = useBranches(
    repo._id,
    repo.owner,
    repo.name,
    shouldFetch,
  );
  const listRef = useRef<HTMLDivElement>(null);

  /* eslint-disable no-effect/no-event-handler --
     Resets the popover list's DOM scroll position; the list only exists once
     Radix has mounted it, so this cannot run in the trigger's click handler. */
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [open]);
  /* eslint-enable no-effect/no-event-handler */

  useEffect(() => {
    if (!isLoading && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [isLoading]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [searchValue]);

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (newOpen) {
          setShouldFetch(true);
        } else {
          setSearchValue("");
        }
      }}
      modal={false}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          data-slot="select-trigger"
          disabled={disabled}
          className={cn("w-full justify-between", className ?? "h-8 text-sm")}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <IconGitBranch
              size={14}
              className="text-muted-foreground shrink-0"
            />
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value || placeholder}
            </span>
          </div>
          <IconChevronDown size={14} className="ml-2 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(320px,calc(100vw-2rem))] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Search branches..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList
            ref={listRef}
            // `dvh` cap so the list stays inside the visible area once a phone
            // keyboard is up over the search field.
            className="max-h-[min(300px,55dvh)]"
            onWheel={(e) => e.stopPropagation()}
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Spinner size="sm" className="size-3.5" />
                <span>Loading branches...</span>
              </div>
            ) : (
              <>
                <CommandEmpty>No branch found.</CommandEmpty>
                <CommandGroup>
                  {branches.map((branch) => (
                    <CommandItem
                      key={branch.name}
                      value={branch.name}
                      onSelect={(currentValue) => {
                        onValueChange(currentValue);
                        setOpen(false);
                      }}
                    >
                      <IconGitBranch
                        size={14}
                        className="text-muted-foreground"
                      />
                      <span className="max-sm:min-w-0 max-sm:flex-1 max-sm:truncate">
                        {branch.name}
                      </span>
                      <IconCheck
                        size={14}
                        className={cn(
                          "ml-auto",
                          value === branch.name ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
