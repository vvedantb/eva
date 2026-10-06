"use client";

import {
  IconCode,
  IconLayoutKanban,
  IconTerminal2,
  type Icon,
} from "@tabler/icons-react";
import {
  chatSourceLabel,
  chatSourceShortLabel,
  type ChatSource,
  type ChatSourceKind,
} from "./chatSource";

// Same icons as PLATFORM_SECTIONS (Sessions / Quick Tasks / Projects).
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
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
    >
      <SourceIcon size={11} aria-hidden className="shrink-0" />
      <span className="truncate">{chatSourceShortLabel(source)}</span>
    </span>
  );
}
