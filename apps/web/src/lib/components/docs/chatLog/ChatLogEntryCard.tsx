import { cn } from "@eva/ui";
import { Markdown } from "@eva/ui/markdown";
import { IconChevronRight } from "@tabler/icons-react";
import { CHAT_LOG_KIND_LABELS, chatLogDay, shortSha } from "@eva/shared/chatLog";
import type { ChatLogEntry } from "./useChatLog";

const AUTHOR_LABELS: Record<ChatLogEntry["author"], string> = {
  agent: "Agent",
  user: "You",
  system: "Eva",
};

function timeOfDay(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One Log entry: kind, who and when, then its title. The body, commits and
 * earlier versions stay folded under the title (native `<details>`, no state).
 * `history` holds the entries this one replaced, newest first.
 */
export function ChatLogEntryCard({
  entry,
  history = [],
}: {
  entry: ChatLogEntry;
  history?: ChatLogEntry[];
}) {
  const header = (
    <div className="flex items-center gap-2 text-2xs text-muted-foreground">
      <span
        className={cn(
          "rounded-md px-1.5 py-0.5 font-medium",
          entry.kind === "decision"
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {CHAT_LOG_KIND_LABELS[entry.kind]}
      </span>
      <span className="ml-auto tabular-nums">
        {AUTHOR_LABELS[entry.author]} · {timeOfDay(entry.createdAt)}
      </span>
    </div>
  );
  const hasDetail =
    entry.body !== undefined ||
    (entry.beforeSha !== undefined && entry.afterSha !== undefined) ||
    history.length > 0;
  const titleClass =
    "text-2sm font-medium tracking-[-0.01em] text-pretty text-foreground";

  if (!hasDetail) {
    return (
      <article className="rounded-surface bg-card p-3">
        {header}
        <p className={cn("mt-1.5", titleClass)}>{entry.title}</p>
      </article>
    );
  }

  return (
    <details className="group rounded-surface bg-card p-3">
      <summary className="cursor-pointer list-none">
        {header}
        <p className={cn("mt-1.5 flex items-start gap-1", titleClass)}>
          <span className="min-w-0 flex-1">{entry.title}</span>
          <IconChevronRight
            size={14}
            className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          />
        </p>
      </summary>
      {entry.beforeSha && entry.afterSha ? (
        <p className="mt-1 font-mono text-2xs text-muted-foreground">
          {shortSha(entry.beforeSha)}..{shortSha(entry.afterSha)}
        </p>
      ) : null}
      {entry.body ? (
        <Markdown className="mt-1.5 text-xs text-muted-foreground">
          {entry.body}
        </Markdown>
      ) : null}
      {history.length > 0 ? (
        <details className="group/history mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-foreground">
            <IconChevronRight
              size={12}
              className="shrink-0 transition-transform group-open/history:rotate-90"
            />
            Show {history.length} earlier{" "}
            {history.length === 1 ? "version" : "versions"}
          </summary>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {history.map((older) => (
              <li key={older._id} className="text-pretty">
                <span className="line-through">{older.title}</span>{" "}
                <span className="text-2xs tabular-nums">
                  {chatLogDay(older.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </details>
  );
}
