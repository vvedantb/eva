import type { HTMLAttributes, Ref } from "react";

import { cn } from "../utils/cn";

export type StatusTone =
  | "progress"
  | "business-review"
  | "code-review"
  | "done"
  | "cancelled"
  /**
   * Live/online/enabled. Distinct from `done`: this is a *state* something is
   * currently in, not a workflow stage it has reached. The two read alike by
   * design (`--status-done-bar` sits near `--success`), but a running sandbox
   * or an online teammate is not "done", and spelling it that way misleads
   * the next reader.
   */
  | "active"
  /** Something is wrong and needs attention: a critical finding, a hard error. */
  | "critical"
  | "neutral";

// Plain Record so Tailwind's static-class scanner can see every literal
// class here — a computed `bg-status-${tone}-bar` string would not survive
// the build's CSS purge.
const TONE_CLASS: Record<StatusTone, string> = {
  progress: "bg-status-progress-bar",
  "business-review": "bg-status-business-review-bar",
  "code-review": "bg-status-code-review-bar",
  done: "bg-status-done-bar",
  cancelled: "bg-status-cancelled-bar",
  active: "bg-success",
  critical: "bg-destructive",
  neutral: "bg-muted-foreground/60",
};

const SIZE_CLASS: Record<"sm" | "md", string> = {
  sm: "size-1.5",
  md: "size-2",
};

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  /** Slightly larger dot for detail views. Default "sm". */
  size?: "sm" | "md";
  ref?: Ref<HTMLSpanElement>;
}

/**
 * Linear-style status glyph: a small coloured dot that carries the status,
 * so the label next to it can stay neutral text instead of a coloured pill.
 *
 * `ref` is load-bearing: several call sites make the dot the tooltip anchor
 * via `<TooltipTrigger asChild>`, and Radix composes its ref onto that child
 * to position the popper.
 */
export function StatusDot({
  tone,
  size = "sm",
  className,
  ref,
  "aria-hidden": ariaHidden = true,
  ...props
}: StatusDotProps) {
  return (
    <span
      ref={ref}
      aria-hidden={ariaHidden}
      className={cn(
        "rounded-full shrink-0",
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    />
  );
}
