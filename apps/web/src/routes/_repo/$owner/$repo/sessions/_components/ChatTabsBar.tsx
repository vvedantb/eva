"use client";

import { useState } from "react";
import type { Doc, Id } from "@eva/backend";
import { cn } from "@eva/ui";
import {
  ConfirmDialog,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  LoadingState,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { ChatRenameDialog } from "@/lib/components/chat/ChatRenameDialog";
import { useSessionChatActions } from "@/lib/components/chat/useSessionChatActions";

interface ChatTabsBarProps {
  chats: Doc<"sessionChats">[];
  activeChatId: Id<"sessionChats">;
  /** Chats with an open turn right now. */
  runningChatIds: ReadonlySet<string>;
  onSelect: (chat: Doc<"sessionChats">) => void;
  onCreate: () => void;
  /** Hides `+` while the session is archived or its PR is closed. */
  isReadOnly: boolean;
  isCreating: boolean;
}

/**
 * One tab per chat of the session, Main first, always visible so the `+`
 * that opens a parallel chat is discoverable. Tabs have no close button: a
 * parallel chat goes only through Delete in its context menu, behind a
 * confirm, so a stray click never loses its history. Main can't be deleted.
 * Anatomy follows `PreviewPaneTabs` (tone-only selected tab); the
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
  const { renameChat, deleteChat } = useSessionChatActions();
  const [renameTarget, setRenameTarget] = useState<Doc<"sessionChats"> | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Doc<"sessionChats"> | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  // Chats closed before tabs became permanent stay hidden.
  const openChats = chats.filter((chat) => chat.archived !== true);

  const handleDelete = async (chat: Doc<"sessionChats">) => {
    setIsDeleting(true);
    try {
      await deleteChat(chat._id);
    } catch {
      // The toast already explains it; keep the dialog open to retry.
      setIsDeleting(false);
      return;
    }
    setIsDeleting(false);
    setDeleteTarget(null);
    // The server already falls back to Main; this also clears `?chat=N`.
    const mainChat = openChats.find((c) => c.isMain);
    if (chat._id === activeChatId && mainChat) onSelect(mainChat);
  };

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
                    "flex h-8 shrink-0 items-center rounded-lg motion-base",
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
                      <span
                        className="flex shrink-0 items-center"
                        title="Working"
                      >
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
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent onClick={(e) => e.stopPropagation()}>
                <ContextMenuItem onSelect={() => setRenameTarget(chat)}>
                  <IconPencil size={16} />
                  Rename
                </ContextMenuItem>
                {!chat.isMain ? (
                  <ContextMenuItem
                    className="text-destructive"
                    disabled={running}
                    title={
                      running
                        ? "Stop this chat before you delete it"
                        : undefined
                    }
                    onSelect={() => setDeleteTarget(chat)}
                  >
                    <IconTrash size={16} />
                    Delete
                  </ContextMenuItem>
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
      <ConfirmDialog
        size="md"
        open={deleteTarget !== null}
        // Cancel, Escape and outside click are ignored while `pending`.
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete this chat?"
        description={
          <>
            <strong>{deleteTarget?.title}</strong> and all its messages are
            deleted. This cannot be undone.
          </>
        }
        confirmLabel="Delete chat"
        variant="destructive"
        pending={isDeleting}
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget);
        }}
      />
    </>
  );
}
