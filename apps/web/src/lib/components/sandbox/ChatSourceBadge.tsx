"use client";

import {
  IconCode,
  IconLayoutKanban,
  IconTerminal2,
  type Icon,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@eva/ui";
import { LIST_ROW_CONTROL_CLASS } from "@vvedantb/ui";
import {
  chatSourceLabel,
  chatSourceRoute,
  chatSourceShortLabel,
  type ChatSource,
  type ChatSourceKind,
} from "./chatSource";

const SOURCE_ICONS: Record<ChatSourceKind, Icon> = {
  session: IconTerminal2,
  task: IconCode,
  project: IconLayoutKanban,
};

/** Small pill naming the chat a row was created from ("Task #12"). */
export function ChatSourceBadge({ source }: { source: ChatSource }) {
  const SourceIcon = SOURCE_ICONS[source.kind];
  return (
    <span
      title={chatSourceLabel(source)}
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-3xs font-medium tabular-nums text-muted-foreground"
    >
      <SourceIcon size={11} aria-hidden className="shrink-0" />
      <span className="truncate">{chatSourceShortLabel(source)}</span>
    </span>
  );
}

/**
 * The source pill as a link into that chat's sandbox tab, for rows a project
 * rolls up from its child tasks. Sits above a row's stretched link.
 */
export function ChatSourceLink({
  source,
  sandboxTab,
}: {
  source: ChatSource;
  sandboxTab: "documents" | "artifacts";
}) {
  const route = chatSourceRoute(source, sandboxTab);
  if (!route) return <ChatSourceBadge source={source} />;
  return (
    <Link
      to={route.to}
      params={route.params}
      onClick={(event) => event.stopPropagation()}
      className={cn("min-w-0 hover:opacity-80", LIST_ROW_CONTROL_CLASS)}
    >
      <ChatSourceBadge source={source} />
    </Link>
  );
}
