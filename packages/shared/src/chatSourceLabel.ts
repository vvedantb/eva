/** The chat kinds a doc or artifact source can be. */
export type ChatSourceKind = "session" | "task" | "project";

/**
 * What a label names. `task` is any task (quick or project); `quick_task` is
 * for a context that only holds quick tasks (the Inbox).
 */
export type OwnerLabelKind = ChatSourceKind | "quick_task";

const OWNER_KIND_WORDS: Record<OwnerLabelKind, string> = {
  session: "Session",
  task: "Task",
  quick_task: "Quick task",
  project: "Project",
};

/** "Session #42", "Quick task #12", or the kind word alone without a number. */
export function ownerLabel(kind: OwnerLabelKind, numId?: number): string {
  const word = OWNER_KIND_WORDS[kind];
  return numId === undefined ? word : `${word} #${numId}`;
}

/** The source fields the labels read. */
export interface ChatSourceLabelFields {
  kind: ChatSourceKind;
  numId?: number;
  title: string;
}

/** "Session" / "Task" / "Project". */
export function chatSourceKindLabel(kind: ChatSourceKind): string {
  return ownerLabel(kind);
}

/** Badge text: chat kind and number, e.g. "Task #12". */
export function chatSourceShortLabel(source: ChatSourceLabelFields): string {
  return ownerLabel(source.kind, source.numId);
}

/** Full label: "Task #12 · Fix login". */
export function chatSourceLabel(source: ChatSourceLabelFields): string {
  return `${chatSourceShortLabel(source)} · ${source.title}`;
}
