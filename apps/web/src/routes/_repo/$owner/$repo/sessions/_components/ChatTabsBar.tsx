"use client";

import { useState } from "react";
import type { Doc, Id } from "@eva/backend";
import {
  cn,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  LoadingState,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@eva/ui";
import { IconPencil, IconPlus, IconX } from "@tabler/icons-react";
import { ChatRenameDialog } from "@/lib/components/chat/ChatRenameDialog";
import { useSessionChatActions } from "@/lib/components/chat/useSessionChatActions";

interface ChatTabsBarProps {
  chats: Doc<"sessionChats">[];
  activeChatId: Id<"sessionChats">;
  /** Chats with an open turn right now. */
  runningChatIds: ReadonlySet<string>;
  onSelect: (chat: Doc<"sessionChats">) => void;
  onCreate: () => void;
  /** Hides `+` and close while the session is archived or its PR is closed. */
  isReadOnly: boolean;
  isCreating: boolean;
}

/**
 * One tab per chat of the session, Main first, always visible so the `+`
 * that opens a parallel chat is discoverable. Anatomy follows
 * `PreviewPaneTabs` (tone-only selected tab, close revealed on hover); the
 * running indicator is the sidebar's Drive grid so "working" reads the same
 * everywhere.
 */
export function ChatTabsBar({
  chats,
  activeChatId,
  runningChatIds,
  onSelect,
  onCreate,
  isReadOnly,
  isCreating,
}: ChatTabsBarProps) {
  const { renameChat, closeChat } = useSessionChatActions();
  const [renameTarget, setRenameTarget] = useState<Doc<"sessionChats"> | null>(
    null,
  );
  const openChats = chats.filter((chat) => chat.archived !== true);

  return (
    <>
      <div
        className="flex shrink-0 items-center gap-1 overflow-x-auto px-2 pb-1.5 scrollbar-thin"
        role="tablist"
        aria-label="Chats"
      >
        {openChats.map((chat) => {
          const selected = chat._id === activeChatId;
          const running = runningChatIds.has(chat._id);
          return (
            <ContextMenu key={chat._id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    "group flex h-8 shrink-0 items-center rounded-lg motion-base",
                    selected ? "bg-card" : "hover:bg-muted/80",
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={cn(
                      "motion-press flex h-full min-w-20 max-w-48 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium active:scale-[0.96]",
                      selected
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => onSelect(chat)}
                  >
                    {running ? (
                      <span className="flex shrink-0 items-center" title="Working">
                        <LoadingState
                          label="Working"
                          variant="Drive"
                          size="sm"
                          iconOnly
                        />
                      </span>
                    ) : null}
                    <span className="truncate">{chat.title}</span>
                  </button>
                  {!chat.isMain && !isReadOnly ? (
                    <button
                      type="button"
                      className="hit-target motion-press mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100 active:scale-[0.96] group-hover:opacity-100"
                      aria-label={`Close ${chat.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void closeChat(chat._id);
                      }}
                    >
                      <IconX className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent onClick={(e) => e.stopPropagation()}>
                <ContextMenuItem onSelect={() => setRenameTarget(chat)}>
                  <IconPencil size={16} />
                  Rename
                </ContextMenuItem>
                {!chat.isMain && !isReadOnly ? (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className="text-warning"
                      onSelect={() => void closeChat(chat._id)}
                    >
                      <IconX size={16} />
                      Close chat
                    </ContextMenuItem>
                  </>
                ) : null}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
        {!isReadOnly ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="New chat"
                disabled={isCreating}
                className="motion-press flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/80 hover:text-foreground active:scale-[0.92] disabled:opacity-50"
                onClick={onCreate}
              >
                <IconPlus className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              New chat in this session — runs alongside the others on the same
              sandbox
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <ChatRenameDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSave={async (title) => {
          if (renameTarget) await renameChat(renameTarget._id, title);
        }}
      />
    </>
  );
}
