import { compactRelativeTime } from "@eva/shared/dates";
import { currentDecisions } from "@eva/shared/chatLog";
import {
  SessionSourceList,
  SessionSourceRow,
} from "@/lib/components/sandbox/SessionSourcePane";
import { ChatLogIcon } from "./ChatLogIcon";
import type { ChatLogEntry } from "./useChatLog";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Pinned first row of the Documents tab; opens the chat Log. */
export function ChatLogRow({
  entries,
  onOpen,
}: {
  entries: ChatLogEntry[];
  onOpen: () => void;
}) {
  const last = entries[entries.length - 1];
  const preview = last
    ? `${plural(currentDecisions(entries).length, "decision", "decisions")} · ${plural(entries.length, "entry", "entries")} · Latest: ${last.title}`
    : "Decisions, changes and research from this chat";
  return (
    <SessionSourceList>
      <SessionSourceRow
        title="Log"
        preview={preview}
        timeLabel={last ? compactRelativeTime(last.createdAt) : ""}
        icon={<ChatLogIcon size={16} />}
        link={<button type="button" onClick={onOpen} />}
      />
    </SessionSourceList>
  );
}
