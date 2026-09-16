"use client";

import { useState, type KeyboardEventHandler } from "react";
import { IconSearch } from "@tabler/icons-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@eva/ui";

// "compact" is the always-visible logs/toolbar field. "large" is the icon
// button + popover used on quick-tasks and projects so the toolbar stays short.
type ToggleSearchVariant = "compact" | "large";

interface ToggleSearchProps {
  value: string;
  onChange: (value: string | null) => void;
  placeholder?: string;
  visible?: boolean;
  variant?: ToggleSearchVariant;
}

function SearchField({
  value,
  onChange,
  placeholder,
  className,
  onKeyDown,
  autoFocus,
}: {
  value: string;
  onChange: (value: string | null) => void;
  placeholder: string;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  autoFocus?: boolean;
}) {
  return (
    <SearchInput
      value={value}
      onChange={(next) => onChange(next.length > 0 ? next : null)}
      onClear={() => onChange(null)}
      placeholder={placeholder}
      className={className}
      inputClassName="h-8"
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * Toolbar search. Compact stays an inline field; large collapses to an icon
 * that opens a popover — a primary dot on the button means a query is applied.
 */
export function ToggleSearch({
  value,
  onChange,
  placeholder = "Search...",
  visible = true,
  variant = "compact",
}: ToggleSearchProps) {
  const [open, setOpen] = useState(false);
  const hasQuery = value.trim().length > 0;

  if (!visible) return null;

  if (variant === "compact") {
    return (
      <SearchField
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        // `max-sm:min-w-0` + `sm:shrink-0`: on a phone the field yields to its
        // toolbar siblings instead of forcing the row (and the page) to overflow.
        className="w-36 max-w-none max-sm:min-w-0 sm:w-44 sm:shrink-0"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange(null);
          }
        }}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              size="icon-sm"
              variant="secondary"
              aria-label={hasQuery ? "Search, filter applied" : "Search"}
              aria-pressed={open}
              className="relative motion-press hover:scale-[1.01] active:scale-[0.96]"
            >
              <IconSearch size={16} />
              {hasQuery ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-0.5 -right-0.5 z-10 size-2 rounded-full bg-primary ring-2 ring-background"
                />
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Search</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-72 p-2"
        onOpenAutoFocus={(event) => {
          const input = event.currentTarget.querySelector("input");
          if (input instanceof HTMLInputElement) {
            event.preventDefault();
            input.focus();
          }
        }}
      >
        <SearchField
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full max-w-none"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
