import { cn } from "@eva/ui";
import { Markdown } from "@eva/ui/markdown";
import { CHAT_LOG_KIND_LABELS, shortSha } from "@eva/shared/chatLog";
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

/** One Log entry: kind, title, who and when, then its markdown body. */
export function ChatLogEntryCard({ entry }: { entry: ChatLogEntry }) {
  const replaced = entry.supersededById !== undefined;
  return (
    <article className="rounded-surface bg-card p-3">
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
        {replaced ? <span className="font-medium">Replaced</span> : null}
        <span className="ml-auto tabular-nums">
          {AUTHOR_LABELS[entry.author]} · {timeOfDay(entry.createdAt)}
        </span>
      </div>
      <p
        className={cn(
          "mt-1.5 text-2sm font-medium tracking-[-0.01em] text-pretty text-foreground",
          replaced && "text-muted-foreground line-through",
        )}
      >
        {entry.title}
      </p>
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
    </article>
  );
}
