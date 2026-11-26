"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
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
import { IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
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
      <ChatTabStrip label="Chats">
        {openChats.map((chat) => {
          const selected = chat._id === activeChatId;
          const running = runningChatIds.has(chat._id);
          return (
            <ContextMenu key={chat._id}>
              <ContextMenuTrigger asChild>
                <ChatTab
                  selected={selected}
                  running={running}
                  label={chat.title}
                  onSelect={() => onSelect(chat)}
                />
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
          <ChatTabAddButton
            label="New chat"
            tooltip="New chat in this session — runs alongside the others on the same sandbox"
            disabled={isCreating}
            onClick={onCreate}
          />
        ) : null}
      </ChatTabStrip>
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

/** A row of chat tabs that scrolls sideways (sessions and projects). */
export function ChatTabStrip({
  label,
  className,
  children,
}: {
  /** The tab list's accessible name. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        // min-w-0: in a narrow chat column the row scrolls instead of
        // spilling under the panel beside it.
        "flex min-w-0 max-w-full shrink-0 items-center gap-1 overflow-x-auto px-2 pb-1.5 scrollbar-thin",
        className,
      )}
      role="tablist"
      aria-label={label}
    >
      {children}
    </div>
  );
}

/**
 * One chat tab: tone-only selected fill, and the sidebar's Drive grid while
 * the chat works. `onClose` adds a ✕ after the label. The rest of the props
 * land on the tab's root, so a context menu trigger can wrap it.
 */
export function ChatTab({
  selected,
  running,
  label,
  hint,
  onSelect,
  onClose,
  closeLabel,
  className,
  ...root
}: ComponentProps<"div"> & {
  selected: boolean;
  running: boolean;
  label: ReactNode;
  /** Native tooltip on the tab (a full title the pill truncates). */
  hint?: string;
  onSelect: () => void;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div
      {...root}
      className={cn(
        "flex h-8 shrink-0 items-center rounded-lg motion-base",
        selected ? "bg-card" : "hover:bg-muted/80",
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        title={hint}
        // The selected tab scrolls into view (a tab just opened at the end
        // of a long row).
        ref={
          selected
            ? (el) => {
                el?.scrollIntoView({ block: "nearest", inline: "nearest" });
              }
            : undefined
        }
        className={cn(
          "motion-press flex h-full min-w-20 max-w-48 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium active:scale-[0.96]",
          onClose ? "pr-1" : undefined,
          selected
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={onSelect}
      >
        {running ? (
          <span className="flex shrink-0 items-center" title="Working">
            <LoadingState label="Working" variant="Drive" size="sm" iconOnly />
          </span>
        ) : null}
        <span className="truncate">{label}</span>
      </button>
      {onClose ? (
        <button
          type="button"
          aria-label={closeLabel}
          className="motion-press mr-1 flex size-5 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.92]"
          onClick={onClose}
        >
          <IconX className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** The `+` at the end of a chat tab strip. */
export function ChatTabAddButton({
  label,
  tooltip,
  disabled = false,
  onClick,
}: {
  label: string;
  tooltip: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          className="motion-press flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/80 hover:text-foreground active:scale-[0.92] disabled:opacity-50"
          onClick={onClick}
        >
          <IconPlus className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
