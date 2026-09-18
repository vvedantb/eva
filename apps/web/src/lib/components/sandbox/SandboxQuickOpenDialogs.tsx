"use client";

import {
  useDeferredValue,
  useState,
  type ComponentType,
} from "react";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  Dialog,
  DialogContent,
} from "@eva/ui";
import { IconFileCode, IconRefresh } from "@tabler/icons-react";
import {
  useShortcut,
  useShortcutBinding,
} from "@/lib/hotkeys/useShortcut";
import type { SandboxFileListApi } from "./useSandboxFileList";
import {
  rankSandboxFiles,
  sandboxFileDirectory,
  sandboxFileName,
} from "./sandboxFileSearch";

const EMPTY_PATHS: string[] = [];

export interface SandboxPaletteCommand {
  id: string;
  label: string;
  keywords: string;
  icon: ComponentType<{ className?: string }>;
  run: () => void;
  disabled?: boolean;
  shortcut?: string;
}

interface SandboxQuickOpenDialogsProps {
  fileList: SandboxFileListApi;
  commands: ReadonlyArray<SandboxPaletteCommand>;
  onShowFiles: () => void;
  hotkeysEnabled: boolean;
  filesEnabled: boolean;
}

function fileListMessage(fileList: SandboxFileListApi): string {
  switch (fileList.state.kind) {
    case "idle":
    case "loading":
      return "Loading files…";
    case "not_running":
      return "Wake Eva up to search files";
    case "error":
      return fileList.state.message;
    case "loaded":
      return "No matching files";
  }
}

export function SandboxQuickOpenDialogs({
  fileList,
  commands,
  onShowFiles,
  hotkeysEnabled,
  filesEnabled,
}: SandboxQuickOpenDialogsProps) {
  const [fileOpen, setFileOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [actionSearch, setActionSearch] = useState("");
  const deferredFileSearch = useDeferredValue(fileSearch);
  const navigate = useNavigate();
  const openFileBinding = useShortcutBinding("openSandboxFile");
  const toggleConsoleBinding = useShortcutBinding("togglePreviewConsole");

  useShortcut(
    "openSandboxFile",
    (event) => {
      event.preventDefault();
      setActionsOpen(false);
      // Refresh outside the updater: updaters must stay pure, and StrictMode
      // double-invokes them, which fired two list execs per open.
      if (!fileOpen) fileList.refresh();
      setFileOpen(!fileOpen);
    },
    { enabled: hotkeysEnabled && filesEnabled },
  );
  useShortcut(
    "openSandboxActions",
    (event) => {
      event.preventDefault();
      setFileOpen(false);
      setActionsOpen((current) => !current);
    },
    { enabled: hotkeysEnabled },
  );

  const loaded = fileList.state.kind === "loaded" ? fileList.state : null;
  const filePaths = loaded ? loaded.paths : EMPTY_PATHS;
  const matchingPaths = rankSandboxFiles(filePaths, deferredFileSearch);

  const handleFileOpenChange = (open: boolean) => {
    setFileOpen(open);
    if (!open) setFileSearch("");
  };
  const handleActionsOpenChange = (open: boolean) => {
    setActionsOpen(open);
    if (!open) setActionSearch("");
  };
  const handleSelectFile = (relativePath: string) => {
    if (!loaded) return;
    void navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        file: `${loaded.root}/${relativePath}`,
      }),
    });
    onShowFiles();
    setFileOpen(false);
    setFileSearch("");
  };
  const openFilesFromActions = () => {
    setActionsOpen(false);
    setActionSearch("");
    fileList.refresh();
    setFileOpen(true);
  };
  const runCommand = (command: SandboxPaletteCommand) => {
    setActionsOpen(false);
    setActionSearch("");
    command.run();
  };

  return (
    <>
      <Dialog open={fileOpen} onOpenChange={handleFileOpenChange}>
        <DialogContent
          hideCloseButton
          className="max-w-xl gap-0 overflow-hidden p-0"
        >
          <Command shouldFilter={false} className="border-0">
            <CommandInput
              autoFocus
              placeholder="Search files by name or path…"
              value={fileSearch}
              onValueChange={setFileSearch}
            />
            <CommandList className="max-h-[min(26rem,65dvh)]">
              <CommandEmpty className="px-4 text-muted-foreground">
                {fileListMessage(fileList)}
              </CommandEmpty>
              {matchingPaths.map((path) => {
                const directory = sandboxFileDirectory(path);
                return (
                  <CommandItem
                    key={path}
                    value={path}
                    onSelect={() => handleSelectFile(path)}
                  >
                    <IconFileCode className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {sandboxFileName(path)}
                    </span>
                    {directory.length > 0 ? (
                      <CommandShortcut className="max-w-[55%] truncate normal-case tracking-normal">
                        {directory}
                      </CommandShortcut>
                    ) : null}
                  </CommandItem>
                );
              })}
              {fileList.state.kind === "error" ? (
                <div className="flex justify-center pb-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={fileList.refresh}
                  >
                    <IconRefresh className="size-4" />
                    Retry
                  </Button>
                </div>
              ) : null}
            </CommandList>
            {loaded?.truncated ? (
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                Showing matches from the first 20,000 repository files.
              </p>
            ) : null}
          </Command>
        </DialogContent>
      </Dialog>

      <Dialog open={actionsOpen} onOpenChange={handleActionsOpenChange}>
        <DialogContent
          hideCloseButton
          className="max-w-xl gap-0 overflow-hidden p-0"
        >
          <Command className="border-0">
            <CommandInput
              autoFocus
              placeholder="Search sandbox actions…"
              value={actionSearch}
              onValueChange={setActionSearch}
            />
            <CommandList className="max-h-[min(26rem,65dvh)]">
              <CommandEmpty>No matching actions</CommandEmpty>
              {filesEnabled ? (
                <CommandGroup heading="Files">
                  <CommandItem
                    value="open file search quick navigate"
                    onSelect={openFilesFromActions}
                  >
                    <IconFileCode className="text-muted-foreground" />
                    Open File…
                    <CommandShortcut>
                      {formatForDisplay(openFileBinding)}
                    </CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              <CommandGroup heading="Sandbox">
                {commands.map((command) => {
                  const Icon = command.icon;
                  const shortcut =
                    command.id === "toggle-terminal-panel"
                      ? formatForDisplay(toggleConsoleBinding)
                      : command.shortcut;
                  return (
                    <CommandItem
                      key={command.id}
                      value={`${command.label} ${command.keywords}`}
                      disabled={command.disabled}
                      onSelect={() => runCommand(command)}
                    >
                      <Icon className="text-muted-foreground" />
                      {command.label}
                      {shortcut ? (
                        <CommandShortcut>{shortcut}</CommandShortcut>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
