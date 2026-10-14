import { useState, type ReactNode } from "react";

/**
 * A sandbox tab body that mounts the first time its tab is shown, then stays
 * mounted (hidden) so switching back keeps its state.
 *
 * Mounting every tab up front made each session open pay for panes the user
 * may never look at: the Review diffs, the file tree, Editor and Browser
 * iframes, docs and artifacts — and every kept-alive session paid it again.
 */
export function KeepAlivePane({
  active,
  className,
  children,
}: {
  active: boolean;
  /** Classes while shown; a hidden pane is `hidden`. */
  className: string;
  children: ReactNode;
}) {
  // Render-phase latch, not an effect: the first active render mounts the
  // body in the same commit as the tab switch.
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  if (!visited) return null;
  return <div className={active ? className : "hidden"}>{children}</div>;
}
