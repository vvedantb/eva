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
 * The actions in the web order. An archived session drops Rename and
 * Regenerate title and has Unarchive in place of Archive; simple view drops
 * the branch and PR items, as the web does. Fork, Send for Review, PR
 * submenus and Remove from group are web-only (they need web dialogs).
 */
export function sessionMenuActions(session: {
  archived: boolean;
  branchName?: string;
  prUrl?: string;
  simpleView: boolean;
}): SessionMenuAction[] {
  const showGit = !session.simpleView;
  const actions: SessionMenuAction[] = session.archived ? [] : ["rename", "regenerateTitle"];
  actions.push("copyTitle", "copyLink");
  if (showGit && session.branchName) actions.push("copyBranchName");
  if (showGit && session.prUrl) actions.push("openPr");
  actions.push(session.archived ? "unarchive" : "archive");
  return actions;
}
