import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { compactRelativeTime } from "@eva/shared/dates";
import { chatSourceRoute } from "@/lib/components/sandbox/chatSource";
import { ChatSourceBadge } from "@/lib/components/sandbox/ChatSourceBadge";
import { sidebarNavLinkClass } from "@/lib/components/sidebar/SharedLayoutNav";
import { CHAT_LOG_PANEL_ITEM } from "@/lib/search-params";
import { ChatLogIcon } from "./ChatLogIcon";
import { ListEnter } from "@vvedantb/ui";

type RepoChatLog = FunctionReturnType<typeof api.chatLog.listForRepo>[number];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Chat Logs in the repo Documents list. Read-only: each row opens the Log in
 * its chat's Documents tab, where the entries live.
 */
export function ChatLogSidebarRows({
  logs,
  indexOffset,
  onNavigate,
}: {
  logs: RepoChatLog[];
  indexOffset: number;
  onNavigate?: () => void;
}) {
  return logs.map((log, index) => {
    if (!log.source) return null;
    const route = chatSourceRoute(log.source, "documents");
    if (!route) return null;
    return (
      <ListEnter key={log.source.id} index={indexOffset + index} fast>
        <Link
          to={route.to}
          params={route.params}
          search={{ panelItem: CHAT_LOG_PANEL_ITEM }}
          onClick={onNavigate}
          title={`${plural(log.decisionCount, "decision", "decisions")} · ${plural(log.entryCount, "entry", "entries")} · Latest: ${log.latestTitle}`}
          className={sidebarNavLinkClass(false)}
        >
          <ChatLogIcon
            size={14}
            aria-hidden
            className="shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate">Log · {log.source.title}</span>
            <span className="mt-0.5 flex">
              <ChatSourceBadge source={log.source} />
            </span>
          </span>
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {compactRelativeTime(log.updatedAt)}
          </span>
        </Link>
      </ListEnter>
    );
  });
}
