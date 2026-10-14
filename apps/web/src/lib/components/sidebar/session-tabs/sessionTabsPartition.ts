import { isSessionSidebarActive } from "@/routes/_repo/$owner/$repo/sessions/_utils/sessionReadOnly";

export interface SessionTabLike {
  archived?: boolean;
}

/**
 * Active tabs = not archived. Archived menu = the archived query's rows. A
 * merged/closed PR moves a session only through the server's auto-archive.
 */
export function partitionSessionsForChromeTabs<
  TActive extends SessionTabLike,
  TArchived extends SessionTabLike,
>(
  nonArchived: TActive[],
  archived: TArchived[],
): { active: TActive[]; archivedMenu: TArchived[] } {
  return {
    active: nonArchived.filter(isSessionSidebarActive),
    archivedMenu: archived,
  };
}
