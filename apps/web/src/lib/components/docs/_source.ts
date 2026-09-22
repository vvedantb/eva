import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { encodeRepoParam } from "@/lib/utils/repoUrl";

type DocRow = FunctionReturnType<typeof api.docs.list>[number];

export type DocSource = NonNullable<DocRow["source"]>;

/** One-line source label for sidebar rows and the session Documents pane. */
export function docSourceLabel(source: DocSource): string {
  const kind =
    source.kind === "session"
      ? "Session"
      : source.kind === "task"
        ? "Task"
        : "Project";
  const num = source.numId !== undefined ? ` #${source.numId}` : "";
  return `${kind}${num} · ${source.title}`;
}

/** Route into the source chat's Documents tab, or null when numId is missing. */
export function docSourceRoute(source: DocSource): {
  to:
    | "/$owner/$repo/sessions/$numId/$sandboxTab"
    | "/$owner/$repo/quick-tasks/$numId/sandbox/$sandboxTab"
    | "/$owner/$repo/projects/$numId/sandbox/$sandboxTab";
  params: {
    owner: string;
    repo: string;
    numId: string;
    sandboxTab: "documents";
  };
} | null {
  if (source.numId === undefined) return null;
  const params = {
    owner: source.owner,
    repo: encodeRepoParam(source.repo, source.rootDirectory),
    numId: String(source.numId),
    sandboxTab: "documents" as const,
  };
  if (source.kind === "session") {
    return { to: "/$owner/$repo/sessions/$numId/$sandboxTab", params };
  }
  if (source.kind === "task") {
    return {
      to: "/$owner/$repo/quick-tasks/$numId/sandbox/$sandboxTab",
      params,
    };
  }
  return { to: "/$owner/$repo/projects/$numId/sandbox/$sandboxTab", params };
}
