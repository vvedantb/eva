"use client";

import { useEffect } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Doc, SandboxOwner } from "@eva/backend";
import { useLocalStorage } from "usehooks-ts";
import type { SandboxTab } from "@/lib/search-params";
import {
  useConsoleDock,
  type ConsoleDockApi,
} from "@/lib/components/sandbox/useConsoleDock";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

const MAX_TERMINAL_PANES = 8;
const MAX_PREVIEW_PANES = 8;

// Base sandbox tabs (PRD is added separately per-surface). Stable references so
// the Shift+Tab hotkey memo and tab bar filter don't recompute every render.
const ALL_SANDBOX_TABS: ReadonlyArray<SandboxTab> = [
  "preview",
  "computer",
  "editor",
  "review",
];
const SIMPLE_VIEW_SANDBOX_TABS: ReadonlyArray<SandboxTab> = ["preview"];

interface PaneStorageState {
  ids: string[];
  activeId: string;
}

export type SharedTerminalPane = NonNullable<
  Doc<"sessions">["terminalPanes"]
>[number];

export interface SandboxPanesApi {
  consoleDock: ConsoleDockApi;
  previewIds: string[];
  /** The default dev-server pane (index 0), rendered as the preview Console. */
  consolePane: SharedTerminalPane | undefined;
  /** User-created terminals (index 1..N), shown in the bottom panel. */
  userTermPanes: SharedTerminalPane[];
  resolvedPreviewActive: string;
  resolvedTermActive: string;
  setPreviewActive: (id: string) => void;
  setTermActive: (id: string) => void;
  handleNewPreview: () => void;
  handleNewTerminal: () => Promise<void>;
  handleClosePreview: (id: string) => void;
  handleCloseTerminal: (id: string) => Promise<void>;
  newPreviewDisabled: boolean;
  newTerminalDisabled: boolean;
  /** Base tabs rendered in the right sandbox panel. */
  enabledTabs: ReadonlyArray<SandboxTab>;
}

interface UseSandboxPanesArgs {
  owner: SandboxOwner;
  /**
   * Full localStorage namespace for pane state — e.g. `session:<id>` or
   * `task:<id>`. Final keys: `eva:<storageScope>:previews` and
   * `eva:<storageScope>:terminals`.
   */
  storageScope: string;
  isActive: boolean;
  terminalPanes: SharedTerminalPane[] | undefined;
}

/**
 * Owns multi-pane preview/terminal state for a sandbox panel. Persists pane
 * lists in localStorage so navigating away and back restores the same set of
 * panes. Disconnects the underlying PTY when a terminal pane is closed.
 *
 * Shared by both the session sandbox panel and the quick-task sandbox panel.
 */
export function useSandboxPanes({
  owner,
  storageScope,
  isActive,
  terminalPanes,
}: UseSandboxPanesArgs): SandboxPanesApi {
  const simpleView = useSimpleView();
  const disconnectPtyAction = useAction(api.pty.disconnectPty);
  const ensureDefaultTerminalPane = useMutation(
    api.sandboxPanes.ensureDefaultTerminalPane,
  );
  const createTerminalPane = useMutation(api.sandboxPanes.createTerminalPane);
  const closeTerminalPane = useMutation(api.sandboxPanes.closeTerminalPane);
  const consoleDock = useConsoleDock(storageScope);

  const [previewState, setPreviewState] = useLocalStorage<PaneStorageState>(
    `eva:${storageScope}:previews`,
    { ids: [], activeId: "" },
  );
  const previewIds = previewState.ids;
  const previewActive = previewState.activeId;
  const setPreviewIds = (ids: string[]) => {
    setPreviewState((current) => ({ ...current, ids }));
  };
  const setPreviewActive = (activeId: string) => {
    setPreviewState((current) => ({ ...current, activeId }));
  };

  const [termActive, setTermActiveState] = useLocalStorage<string>(
    `eva:${storageScope}:active-terminal`,
    "",
  );
  const termPanes = terminalPanes ?? [];
  const termIds = termPanes.map((pane) => pane.id);
  // Pane 0 is the shared dev-server pane (rendered as the preview Console);
  // panes 1..N are user-created terminals shown in the bottom panel.
  const consolePane = termPanes[0];
  const userTermPanes = termPanes.slice(1);
  const userTermIds = userTermPanes.map((pane) => pane.id);
  const setTermActive = (activeId: string) => {
    setTermActiveState(activeId);
  };

  // Terminal panes are shared Convex state so every collaborator sees and
  // controls the same PTYs. Ensure the default pane exists on mount even when
  // the sandbox is inactive — TerminalView needs a slot to render its
  // "start the sandbox to view terminal" empty state. The mutation is
  // idempotent for concurrent viewers.
  useEffect(() => {
    if (termIds.length > 0) return;
    void ensureDefaultTerminalPane({ owner });
  }, [termIds.length, ensureDefaultTerminalPane, owner]);

  // Ensure a default preview pane exists even before the Preview tab is
  // selected, so the iframe can mount (hidden) and stay cached across tab
  // switches — including first paint on Review / Editor deep-links.
  useEffect(() => {
    if (previewIds.length > 0) return;
    const id = crypto.randomUUID();
    setPreviewIds([id]);
    setPreviewActive(id);
  }, [previewIds.length, setPreviewIds, setPreviewActive]);

  // Reconcile active id if it points at a removed pane (or the console pane,
  // whose id can linger in localStorage from before this became user-only).
  useEffect(() => {
    if (userTermIds.length === 0) return;
    if (termActive && userTermIds.includes(termActive)) return;
    setTermActive(userTermIds[0]);
  }, [userTermIds, termActive, setTermActive]);

  useEffect(() => {
    if (previewIds.length === 0) return;
    if (previewActive && previewIds.includes(previewActive)) return;
    setPreviewActive(previewIds[0]);
  }, [previewIds, previewActive, setPreviewActive]);

  const resolvedTermActive =
    userTermIds.length > 0
      ? termActive && userTermIds.includes(termActive)
        ? termActive
        : userTermIds[0]
      : "";
  const resolvedPreviewActive =
    previewIds.length > 0
      ? previewActive && previewIds.includes(previewActive)
        ? previewActive
        : previewIds[0]
      : "";

  const handleNewPreview = () => {
    if (!isActive || previewIds.length >= MAX_PREVIEW_PANES) return;
    const id = crypto.randomUUID();
    const next = previewIds.length === 0 ? [id] : [...previewIds, id];
    setPreviewIds(next);
    setPreviewActive(id);
  };

  const handleNewTerminal = async () => {
    if (!isActive || termIds.length >= MAX_TERMINAL_PANES) return;
    try {
      const pane = await catchMutationError(
        createTerminalPane({ owner }),
        "Couldn't create terminal",
        "sandbox-terminal-create",
      );
      setTermActive(pane.id);
    } catch {
      // toast shown
    }
  };

  const handleCloseTerminal = async (ptyId: string) => {
    // The console pane is never closable from the UI.
    if (consolePane?.id === ptyId) return;
    const removedIdx = userTermIds.indexOf(ptyId);
    if (removedIdx < 0) return;
    const next = userTermIds.filter((id) => id !== ptyId);
    try {
      await disconnectPtyAction({ owner, ptyInstanceId: ptyId });
    } catch {
      // still remove from UI
    }
    try {
      await catchMutationError(
        closeTerminalPane({ owner, paneId: ptyId }),
        "Couldn't close terminal",
        "sandbox-terminal-close",
      );
    } catch {
      return;
    }
    if (termActive === ptyId) {
      const pick = next[removedIdx - 1] ?? next[0] ?? "";
      setTermActive(pick);
    }
  };

  const handleClosePreview = (previewId: string) => {
    if (previewIds[0] === previewId) return;
    const removedIdx = previewIds.indexOf(previewId);
    if (removedIdx < 0) return;
    const next = previewIds.filter((id) => id !== previewId);
    setPreviewIds(next);
    if (previewActive === previewId) {
      const pick = next[removedIdx - 1] ?? next[0] ?? "";
      setPreviewActive(pick);
    }
  };

  const newTerminalDisabled = !isActive || termIds.length >= MAX_TERMINAL_PANES;
  const newPreviewDisabled =
    !isActive || previewIds.length >= MAX_PREVIEW_PANES;

  return {
    consoleDock,
    previewIds,
    consolePane,
    userTermPanes,
    resolvedPreviewActive,
    resolvedTermActive,
    setPreviewActive,
    setTermActive,
    handleNewPreview,
    handleNewTerminal,
    handleClosePreview,
    handleCloseTerminal,
    newPreviewDisabled,
    newTerminalDisabled,
    enabledTabs: simpleView ? SIMPLE_VIEW_SANDBOX_TABS : ALL_SANDBOX_TABS,
  };
}
