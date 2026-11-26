/**
 * Archive copy and list modes for quick tasks and projects, shared by the web
 * and the phone. Tasks and projects are never deleted: archive hides them
 * from the lists, and an Active / Archived switch shows them again (the
 * sessions list pattern).
 */

export type ArchivableKind = "task" | "project";

export const ARCHIVE_LIST_MODES = ["active", "archived"] as const;
export type ArchiveListMode = (typeof ARCHIVE_LIST_MODES)[number];

export const ARCHIVE_LIST_MODE_LABELS: Record<ArchiveListMode, string> = {
  active: "Active",
  archived: "Archived",
};

export function isArchiveListMode(value: string): value is ArchiveListMode {
  return value === "active" || value === "archived";
}

/** The menu labels. */
export const ARCHIVE_LABEL = "Archive";
export const UNARCHIVE_LABEL = "Unarchive";

/** "task", "3 tasks". */
function countedNoun(kind: ArchivableKind, count: number): string {
  return count === 1 ? kind : `${count} ${kind}s`;
}

/** "Task", "3 tasks". */
function subject(kind: ArchivableKind, count: number): string {
  const noun = countedNoun(kind, count);
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

/**
 * Confirm, toast and empty-list copy for archiving `count` tasks or projects,
 * in the session archive toast's wording ("Session archived", Undo).
 */
export function archiveCopy(kind: ArchivableKind, count = 1) {
  const plural = count === 1 ? kind : `${kind}s`;
  return {
    confirmTitle: `Archive ${countedNoun(kind, count)}?`,
    archived: `${subject(kind, count)} archived`,
    unarchived: `${subject(kind, count)} unarchived`,
    archiveFailed: `Couldn't archive ${plural}`,
    unarchiveFailed: `Couldn't unarchive ${plural}`,
    emptyArchived: `No archived ${kind}s`,
  };
}
