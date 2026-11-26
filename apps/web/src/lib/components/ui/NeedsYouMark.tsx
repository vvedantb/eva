import { cn } from "@eva/ui";
import { IconAlertTriangle } from "@tabler/icons-react";

/**
 * The "needs you" mark of a project or a project task (`projectTaskNeedsYou`):
 * the same shape and tone as `AwaitingAnswerMark`, with the warning triangle
 * the setup banners use.
 */
export function NeedsYouMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center text-warning", className)}>
      <IconAlertTriangle size={14} stroke={2} />
      <span className="sr-only">Needs you</span>
    </span>
  );
}
