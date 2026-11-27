import { Activity, useState, type ReactNode } from "react";

/**
 * A sandbox tab body that mounts the first time its tab is shown, then stays
 * in a hidden `<Activity>` so switching back keeps its DOM and state while its
 * effects (subscriptions, timers) pause off screen.
 *
 * Mounting every tab up front made each session open pay for panes the user
 * may never look at: the Review diffs, the file tree, Editor and Browser
 * iframes, docs and artifacts — and every kept-alive session paid it again.
 *
 * `discard` unmounts the body and forgets the visit. Iframe tabs (Editor,
 * Browser, custom tabs) set it while their session is off screen: each one is
 * a separate browser process, and `<Activity>` hiding it frees nothing.
 *
 * Terminals must keep streaming while hidden, so they do not use this.
 */
export function KeepAlivePane({
  active,
  discard = false,
  className,
  children,
}: {
  active: boolean;
  discard?: boolean;
  className: string;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(active && !discard);
  if (discard) {
    if (visited) setVisited(false);
    return null;
  }
  if (active && !visited) setVisited(true);
  if (!visited) return null;
  return (
    <Activity mode={active ? "visible" : "hidden"}>
      <div className={className}>{children}</div>
    </Activity>
  );
}
