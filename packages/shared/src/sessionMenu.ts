/**
 * The web session row menu (`SessionMenuItems`), as data, for surfaces that
 * draw it without the web components (the phone app's long-press sheet).
 */
export type SessionMenuAction =
  | "rename"
  | "regenerateTitle"
  | "copyTitle"
  | "copyLink"
  | "copyBranchName"
  | "openPr"
  | "unarchive"
  | "archive";

/**
 * The actions in the web order and groups: the menu draws a divider between
 * two groups, as the web `ContextMenuSeparator`s do (the main block, then
 * Unarchive or Archive on its own). An archived session drops Rename and
 * Regenerate title and has Unarchive in place of Archive; simple view drops
 * the branch and PR items, as the web does. Fork, Send for Review, PR
 * submenus and Remove from group are web-only (they need web dialogs).
 */
export function sessionMenuActions(session: {
  archived: boolean;
  branchName?: string;
  prUrl?: string;
  simpleView: boolean;
}): SessionMenuAction[][] {
  const showGit = !session.simpleView;
  const main: SessionMenuAction[] = session.archived ? [] : ["rename", "regenerateTitle"];
  main.push("copyTitle", "copyLink");
  if (showGit && session.branchName) main.push("copyBranchName");
  if (showGit && session.prUrl) main.push("openPr");
  return [main, [session.archived ? "unarchive" : "archive"]];
}
