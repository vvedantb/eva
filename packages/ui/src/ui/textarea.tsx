import * as React from "react";
import { cn } from "../utils/cn";
import { CONTROL_RADIUS_CLASS } from "../utils/surface-radius";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // 16px below `sm` — see the note in input.tsx.
        "flex min-h-[84px] w-full max-sm:min-w-0 border border-input bg-card px-3.5 py-2.5 text-base sm:text-sm transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/90 focus-visible:border-ring/50 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
        CONTROL_RADIUS_CLASS,
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
