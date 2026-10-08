"use client";

import {
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconTerminal2,
  IconX,
} from "@tabler/icons-react";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import type { SandboxOwner } from "@eva/backend";
import { TerminalPanel } from "@/routes/_repo/$owner/$repo/sessions/TerminalPanel";
import type { SandboxPanesApi } from "./useSandboxPanes";

interface SandboxTerminalPanelProps {
  owner: SandboxOwner;
  sandboxId: string | undefined;
  isActive: boolean;
  expanded: boolean;
  panes: SandboxPanesApi;
  onClose: () => void;
}

/** Interactive terminal tabs hosted in the workspace-wide bottom panel. */
export function SandboxTerminalPanel({
  owner,
  sandboxId,
  isActive,
  expanded,
  panes,
  onClose,
}: SandboxTerminalPanelProps) {
  const { userTermPanes, resolvedTermActive } = panes;

  const closeTerminal = (id: string) => {
    if (userTermPanes.length === 1) onClose();
    void panes.handleCloseTerminal(id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-10 shrink-0 items-center border-b border-border bg-muted/40 pl-2">
        <div
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-thin"
          role="tablist"
          aria-label="Terminal tabs"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {userTermPanes.map((pane) => {
              const selected = pane.id === resolvedTermActive;
              return (
                <m.div
                  key={pane.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={motionFast}
                  className={cn(
                    "group flex h-9 shrink-0 items-center rounded-md transition-[background-color]",
                    selected ? "bg-card" : "hover:bg-secondary",
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={cn(
                      "flex h-full min-w-24 items-center gap-1.5 rounded-md pl-2.5 pr-2 text-xs font-medium transition-[color,scale] active:scale-[0.96]",
                      selected
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => panes.setTermActive(pane.id)}
                  >
                    <IconTerminal2 className="size-3.5 shrink-0" />
                    {pane.title}
                  </button>
                  <button
                    type="button"
                    className="hit-target mr-1 flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-[color,background-color,scale] hover:bg-muted hover:text-foreground active:scale-[0.96]"
                    aria-label={`Close ${pane.title}`}
                    onClick={() => closeTerminal(pane.id)}
                  >
                    <IconX className="size-3.5" />
                  </button>
                </m.div>
              );
            })}
          </AnimatePresence>
        </div>

        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center text-muted-foreground transition-[color,background-color,scale] hover:bg-secondary hover:text-foreground active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"
          aria-label="New terminal"
          disabled={panes.newTerminalDisabled}
          onClick={() => void panes.handleNewTerminal()}
        >
          <IconPlus className="size-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center text-muted-foreground transition-[color,background-color,scale] hover:bg-secondary hover:text-foreground active:scale-[0.96]"
              aria-label="Open terminal menu"
            >
              <IconChevronDown className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem
              disabled={panes.newTerminalDisabled}
              onClick={() => void panes.handleNewTerminal()}
            >
              <IconPlus size={14} />
              New Terminal
            </DropdownMenuItem>
            {userTermPanes.length > 0 ? <DropdownMenuSeparator /> : null}
            {userTermPanes.map((pane) => (
              <DropdownMenuItem
                key={pane.id}
                onClick={() => panes.setTermActive(pane.id)}
              >
                {pane.id === resolvedTermActive ? (
                  <IconCheck size={14} />
                ) : (
                  <IconTerminal2 size={14} />
                )}
                {pane.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center text-muted-foreground transition-[color,background-color,scale] hover:bg-secondary hover:text-foreground active:scale-[0.96]"
          aria-label="Close terminal panel"
          onClick={onClose}
        >
          <IconX className="size-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {userTermPanes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <IconTerminal2 className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              {isActive
                ? "Create a terminal to start working"
                : "Wake Eva up to use a terminal"}
            </p>
          </div>
        ) : null}
        {userTermPanes.map((pane) => (
          <div
            key={pane.id}
            className={cn(
              resolvedTermActive === pane.id
                ? "flex min-h-0 flex-1 flex-col"
                : "hidden",
            )}
          >
            <TerminalPanel
              owner={owner}
              sandboxId={sandboxId}
              isActive={isActive}
              ptyInstanceId={pane.id}
              isForeground={expanded && resolvedTermActive === pane.id}
              runDevCommandOnConnect={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
