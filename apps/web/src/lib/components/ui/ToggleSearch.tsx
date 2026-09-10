"use client";

import { SearchInput, cn } from "@eva/ui";

// "compact" is the narrow logs/toolbar field; "large" is the wider field on
// quick-tasks and projects.
type ToggleSearchVariant = "compact" | "large";

interface ToggleSearchProps {
  value: string;
  onChange: (value: string | null) => void;
  placeholder?: string;
  visible?: boolean;
  variant?: ToggleSearchVariant;
}

/**
 * Toolbar search built on the shared SearchInput primitive so it matches
 * other controls (border-input, rounded-control, focus ring) instead of a
 * one-off shadowed field.
 */
export function ToggleSearch({
  value,
  onChange,
  placeholder = "Search...",
  visible = true,
  variant = "compact",
}: ToggleSearchProps) {
  if (!visible) return null;

  const isLarge = variant === "large";

  return (
    <SearchInput
      value={value}
      onChange={(next) => onChange(next.length > 0 ? next : null)}
      onClear={() => onChange(null)}
      placeholder={placeholder}
      // `max-sm:min-w-0` + `sm:shrink-0`: on a phone the field yields to its toolbar
      // siblings instead of forcing the row (and the page) to overflow. The large
      // field also takes the whole first row there (`max-sm:basis-full`): shared
      // with the view toggle it left two stray buttons wrapped onto a second line.
      className={cn(
        "max-w-none max-sm:min-w-0 sm:shrink-0",
        isLarge ? "w-52 max-sm:basis-full sm:w-64 md:w-72" : "w-36 sm:w-44",
      )}
      // Match neighboring h-8 toolbar chips (view toggle, filter buttons).
      inputClassName="h-8"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onChange(null);
        }
      }}
    />
  );
}
