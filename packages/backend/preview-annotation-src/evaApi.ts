/**
 * Eva's preview-comments API, for a direct sandbox link.
 *
 * The proxy keeps a token (and the Convex site URL it works against) in an
 * HttpOnly cookie and hands both over at `/__eva_preview_proxy/eva-comments`.
 * With them the page can list, send and resolve comments for the one chat the
 * token names. No token (an old session, a sandbox with no chat) means no
 * Eva features: the toolbar then offers copy only.
 */

export interface EvaSession {
  token: string;
  site: string;
}

export interface EvaComment {
  kind: "message" | "queued";
  id: string;
  feedback: string;
  element: string;
  pagePath: string;
  timestamp: number;
  reply: { status: string; excerpt: string } | null;
  resolved: { at: number; byName: string } | null;
}

export interface EvaCommentInput {
  feedback: string;
  element: string;
  selector: string;
  pagePath: string;
  details: string;
}

const SESSION_PATH = "/__eva_preview_proxy/eva-comments";

function str(value: unknown, key: string): string {
  if (typeof value !== "object" || value === null) return "";
  const field = Reflect.get(value, key);
  return typeof field === "string" ? field : "";
}

function num(value: unknown, key: string): number {
  if (typeof value !== "object" || value === null) return 0;
  const field = Reflect.get(value, key);
  return typeof field === "number" ? field : 0;
}

export async function loadEvaSession(): Promise<EvaSession | null> {
  try {
    const response = await fetch(SESSION_PATH, { credentials: "same-origin" });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const token = str(data, "token");
    const site = str(data, "site");
    return token && site ? { token, site } : null;
  } catch {
    return null;
  }
}

async function call(
  session: EvaSession,
  op: "list" | "send" | "resolve",
  body: object,
): Promise<unknown> {
  const response = await fetch(`${session.site}/preview-comments/${op}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(str(data, "error") || "Eva could not be reached");
  }
  return data;
}

function parseComment(raw: unknown): EvaComment | null {
  const kind = str(raw, "kind");
  if (kind !== "message" && kind !== "queued") return null;
  const reply = typeof raw === "object" && raw ? Reflect.get(raw, "reply") : null;
  const resolved =
    typeof raw === "object" && raw ? Reflect.get(raw, "resolved") : null;
  return {
    kind,
    id: str(raw, "id"),
    feedback: str(raw, "feedback"),
    element: str(raw, "element"),
    pagePath: str(raw, "pagePath"),
    timestamp: num(raw, "timestamp"),
    reply: reply ? { status: str(reply, "status"), excerpt: str(reply, "excerpt") } : null,
    resolved: resolved
      ? { at: num(resolved, "at"), byName: str(resolved, "byName") }
      : null,
  };
}

export async function listComments(session: EvaSession): Promise<EvaComment[]> {
  const data = await call(session, "list", {});
  const raw = typeof data === "object" && data ? Reflect.get(data, "comments") : null;
  if (!Array.isArray(raw)) return [];
  const out: EvaComment[] = [];
  for (const item of raw) {
    const comment = parseComment(item);
    if (comment) out.push(comment);
  }
  return out;
}

export async function sendComment(
  session: EvaSession,
  input: EvaCommentInput,
): Promise<void> {
  await call(session, "send", input);
}

export async function setCommentResolved(
  session: EvaSession,
  id: string,
  resolved: boolean,
): Promise<void> {
  await call(session, "resolve", { id, resolved });
}
