"use client";

import { cn, Shimmer, Spinner } from "@eva/ui";

/**
 * One line for the whole sandbox startup run: the Eva mark tracing itself
 * beside shimmering copy. Simple view hides the plumbing steps (cloning,
 * installing, checking out) because none of them is a decision the reader
 * makes — all they need to know is that Eva is coming up.
 */
export function SandboxStartupIndicator({
  label = "Invoking Eva",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-muted-foreground text-sm",
        className,
      )}
    >
      <Spinner size="sm" />
      <Shimmer as="span" duration={2.5} spread={1.5}>
        {label}
      </Shimmer>
    </div>
  );
}
