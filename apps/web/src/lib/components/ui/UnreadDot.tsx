import { cn } from "@eva/ui";
import { CountPop } from "@/lib/components/ui/CountPop";

/**
 * The one unread mark: sidebar rows, task cards, project cards and tabs. It is
 * `bg-primary`, so it follows the theme accent the user picks (`bg-success`
 * means running, never unread). `CountPop` gives it the pop-in and the exit.
 */
export function UnreadDot({
  show,
  className,
}: {
  show: boolean;
  className?: string;
}) {
  return (
    <CountPop
      label={show ? "unread" : null}
      className={cn("size-1.5 shrink-0 rounded-full bg-primary", className)}
    >
      <span className="sr-only">Unread</span>
    </CountPop>
  );
}
