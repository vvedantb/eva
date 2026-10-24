"use client";

import * as React from "react";
import { IconX } from "@tabler/icons-react";
import { cn } from "../utils/cn";
import { CONTROL_RADIUS_CLASS } from "../utils/surface-radius";

export interface ClearInputProps extends Omit<
  React.ComponentProps<"input">,
  "value" | "onChange"
> {
  value: string;
  onChange: (value: string) => void;
  wrapperClassName?: string;
  /** Icon or adornment positioned in the field's left gutter. */
  leading?: React.ReactNode;
  clearLabel?: string;
}

const ClearInput = React.forwardRef<HTMLInputElement, ClearInputProps>(
  (
    {
      value,
      onChange,
      wrapperClassName,
      leading,
      clearLabel = "Clear",
      className,
      placeholder = "",
      ...props
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    const mergedRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    const preventFocusSteal = (event: React.SyntheticEvent) => {
      if (document.activeElement === inputRef.current) {
        event.preventDefault();
      }
    };

    const handleClear = () => {
      onChange("");
      inputRef.current?.focus();
    };

    return (
      <div className={cn("relative", wrapperClassName)}>
        {leading}
        <input
          ref={mergedRef}
          type="text"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          placeholder={placeholder}
          className={cn(
            // 16px below `sm` — see the note in input.tsx.
            "flex h-10 w-full max-sm:min-w-0 border border-input bg-card px-3.5 py-2 text-base sm:text-sm transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/90 focus-visible:border-ring/50 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            CONTROL_RADIUS_CLASS,
            value.length > 0 && "pr-9",
            className,
          )}
          {...props}
        />
        {value.length > 0 ? (
          <button
            type="button"
            /* The scale composes with the centring `-translate-y-1/2` rather
               than replacing it, so the button presses in place instead of
               dropping half its height. */
            className="max-sm:hit-target motion-press absolute right-2 top-1/2 z-4 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.92] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/35"
            aria-label={clearLabel}
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={handleClear}
          >
            <IconX size={14} stroke={1.75} />
          </button>
        ) : null}
      </div>
    );
  },
);
ClearInput.displayName = "ClearInput";

export { ClearInput };
