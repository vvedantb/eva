import { cn } from "@eva/ui";
import { IconHelpCircle } from "@tabler/icons-react";

/**
 * The one "Eva asked you a question" mark: sidebar session rows, task cards and
 * project cards. It replaces the "Working" grid while a turn waits on a blocking
 * question, because the turn is open but nothing runs until the user answers.
 */
export function AwaitingAnswerMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center text-warning", className)}>
      <IconHelpCircle size={14} stroke={2} className="question-nudge" />
      <span className="sr-only">Waiting for your answer</span>
    </span>
  );
}
