/**
 * Labels for the chat (session, quick task or project) a doc or artifact was
 * created from, shared by the web badge and the phone Documents list.
 */

/** The chat kinds a doc or artifact source can be. */
export type ChatSourceKind = "session" | "task" | "project";

/** The source fields the labels read. */
export interface ChatSourceLabelFields {
  kind: ChatSourceKind;
  numId?: number;
  title: string;
}

/** "Session" / "Task" / "Project". */
export function chatSourceKindLabel(kind: ChatSourceKind): string {
  return kind === "session" ? "Session" : kind === "task" ? "Task" : "Project";
}

/** Badge text: chat kind and number, e.g. "Task #12". */
export function chatSourceShortLabel(source: ChatSourceLabelFields): string {
  const kind = chatSourceKindLabel(source.kind);
  return source.numId !== undefined ? `${kind} #${source.numId}` : kind;
}

/** Full label: "Task #12 · Fix login". */
export function chatSourceLabel(source: ChatSourceLabelFields): string {
  return `${chatSourceShortLabel(source)} · ${source.title}`;
}
