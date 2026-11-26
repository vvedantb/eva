import type { PrState } from "./prState";

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
  | "commitPush"
  | "openPr"
  | "sendForReview"
  | "removeFromGroup"
  | "unarchive"
  | "archive";

/**
 * The actions in the web order and groups: the menu draws a divider between
 * two groups, as the web `ContextMenuSeparator`s do (the main block, then the
 * git group: Commit & push, the web header button, while there is work to
 * push, Open PR and Send for Review; then Remove from group for a row in a
 * linked-session group, then Unarchive or Archive on its own). An archived
 * session drops Rename, Regenerate title and Send for Review and has Unarchive
 * in place of Archive; simple view drops the branch and PR items, as the web
 * does. Fork and the PR submenus are web-only.
 */
export function sessionMenuActions(session: {
  archived: boolean;
  branchName?: string;
  prUrl?: string;
  simpleView: boolean;
  /** A row in a linked-session group (the web `inGroup`). */
  inGroup?: boolean;
  prState?: PrState;
  /** The awake sandbox has uncommitted files or unpushed commits (the web Commit & push button shows then, simple view too). */
  hasUnpushedWork?: boolean;
}): SessionMenuAction[][] {
  const showGit = !session.simpleView;
  const main: SessionMenuAction[] = session.archived ? [] : ["rename", "regenerateTitle"];
  main.push("copyTitle", "copyLink");
  if (showGit && session.branchName) main.push("copyBranchName");
  const pr: SessionMenuAction[] = [];
  if (!session.archived && session.hasUnpushedWork) pr.push("commitPush");
  if (showGit && session.prUrl) pr.push("openPr");
  if (showGit && !session.archived && canSendSessionForReview(session)) pr.push("sendForReview");
  const lastAction = session.archived ? "unarchive" : "archive";
  const groups: SessionMenuAction[][] = [main, pr, session.inGroup ? ["removeFromGroup"] : [], [lastAction]];
  return groups.filter((group) => group.length > 0);
}

/**
 * "Send for Review" opens (or un-drafts) the session's PR, so it needs a
 * branch to open one from and a PR that is not already out for review. One
 * rule for every entry point (the web header and row, the phone menus).
 */
export function canSendSessionForReview(session: { branchName?: string; prState?: PrState }): boolean {
  if (!session.branchName) return false;
  return session.prState === undefined || session.prState === "draft";
}

/** "1 session", "3 sessions": the group archive's count, on the web and the phone. */
export function sessionCountLabel(count: number): string {
  return `${count} ${count === 1 ? "session" : "sessions"}`;
}
