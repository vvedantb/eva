import * as React from "react";
import { cn } from "../utils/cn";
import { CONTROL_RADIUS_CLASS } from "../utils/surface-radius";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // 16px below `sm`: iOS Safari zooms the page when a focused field's
          // computed font-size is under 16px, and the viewport meta no longer
          // blocks zoom (WCAG 1.4.4).
          "flex h-10 w-full max-sm:min-w-0 border border-input bg-card px-3.5 py-2 text-base sm:text-sm transition-[border-color,box-shadow,background-color] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/90 focus-visible:border-ring/50 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          CONTROL_RADIUS_CLASS,
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
