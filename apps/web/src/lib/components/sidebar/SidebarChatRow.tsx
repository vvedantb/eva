"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { m } from "motion/react";
import type { Doc } from "@eva/backend";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  LoadingState,
  cn,
  motionFast,
} from "@eva/ui";
import { IconLink, IconPencil, IconX } from "@tabler/icons-react";
import { ChatRenameDialog } from "@/lib/components/chat/ChatRenameDialog";
import { useSessionChatActions } from "@/lib/components/chat/useSessionChatActions";
import { SharedLayoutNavSurface } from "@/lib/components/sidebar/SharedLayoutNav";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";

interface SidebarChatRowProps {
  chat: Doc<"sessionChats">;
  /** The parent session's row link; the chat adds its `?chat=N`. */
  sessionHref: string;
  isSelected: boolean;
  isRunning: boolean;
  onNavigate?: () => void;
}

/**
 * One parallel chat of a session, indented under the session row (same
 * shape as `HomeTeamsNav`'s nested list). Main has no row of its own — the
 * session row is Main.
 */
export function SidebarChatRow({
  chat,
  sessionHref,
  isSelected,
  isRunning,
  onNavigate,
}: SidebarChatRowProps) {
  const navigate = useNavigate();
  const { renameChat, closeChat } = useSessionChatActions();
  const [renameOpen, setRenameOpen] = useState(false);
  const href = `${sessionHref}?chat=${chat.number}`;
  // `Link` cannot type a search param on a dynamic path, so the row keeps a
  // real href for middle-click / copy and navigates with the chat on click.
  const openChat = (event: React.MouseEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    void navigate({
      to: sessionHref,
      search: (prev) => ({ ...prev, chat: chat.number }),
    });
    onNavigate?.();
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={motionFast}
          >
            <SharedLayoutNavSurface
              itemId={chat._id}
              isActive={isSelected}
              className="group mx-1 rounded-menu-item"
            >
              <a
                href={href}
                onClick={openChat}
                className="block rounded-menu-item py-1.5 pl-8 pr-4 text-[13px] leading-[18px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {isRunning ? (
                    <span className="flex shrink-0 items-center" title="Working">
                      <LoadingState
                        label="Working"
                        variant="Drive"
                        size="sm"
                        iconOnly
                      />
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center" title="Idle">
                      <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
                    </span>
                  )}
                  <MarqueeOnHover
                    className={cn(
                      "min-w-0 flex-1 transition-colors duration-[var(--motion-base)]",
                      isSelected
                        ? "font-medium text-sidebar-primary"
                        : "text-sidebar-foreground/80 hover:text-sidebar-foreground",
                    )}
                  >
                    {chat.title}
                  </MarqueeOnHover>
                </div>
              </a>
            </SharedLayoutNavSurface>
          </m.div>
        </ContextMenuTrigger>
        <ContextMenuContent onClick={(e) => e.stopPropagation()}>
          <ContextMenuItem onSelect={() => setRenameOpen(true)}>
            <IconPencil size={16} />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              void navigator.clipboard.writeText(window.location.origin + href);
            }}
          >
            <IconLink size={16} />
            Copy link
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-warning"
            onSelect={() => void closeChat(chat._id)}
          >
            <IconX size={16} />
            Close chat
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <ChatRenameDialog
        target={renameOpen ? chat : null}
        onClose={() => setRenameOpen(false)}
        onSave={(title) => renameChat(chat._id, title)}
      />
    </>
  );
}
