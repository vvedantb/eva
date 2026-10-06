// Runtime-neutral leaf (no "use node") so the agent prompt and MCP queries can
// name the Preview Console tmux session exactly as the node-side launcher does.

/** Stable tmux session name for a Console/terminal pane id. */
export function tmuxSessionName(ptyInstanceId: string | undefined): string {
  const source =
    ptyInstanceId !== undefined && ptyInstanceId.length > 0
      ? ptyInstanceId
      : "terminal";
  const safe = source.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  return `eva_${safe}`;
}

/** Stable default terminal pane id — must match `sandboxPanes.defaultPane`. */
export function defaultTerminalPtyId(ownerKey: string): string {
  return `${ownerKey}-terminal-default`;
}

/**
 * The tmux session the primary dev server runs in (the Preview Console), for
 * a sandbox owner key: `session-<id>`, `task-<id>` or `project-<id>`.
 */
export function previewConsoleSessionName(ownerKey: string): string {
  return tmuxSessionName(defaultTerminalPtyId(ownerKey));
}
