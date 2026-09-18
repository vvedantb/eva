import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { encodeRepoParam } from "@/lib/utils/repoUrl";

type ArtifactRow = FunctionReturnType<typeof api.artifacts.listAll>[number];

export type ArtifactSource = NonNullable<ArtifactRow["source"]>;

/** One-line source label for cards and the viewer chrome. */
export function artifactSourceLabel(source: ArtifactSource): string {
  const kind =
    source.kind === "session"
      ? "Session"
      : source.kind === "task"
        ? "Task"
        : "Project";
  const num = source.numId !== undefined ? ` #${source.numId}` : "";
  return `${kind}${num} · ${source.title}`;
}

/** Route into the source chat's Artifacts tab, or null when numId is missing. */
export function artifactSourceRoute(source: ArtifactSource): {
  to:
    | "/$owner/$repo/sessions/$numId/$sandboxTab"
    | "/$owner/$repo/quick-tasks/$numId/sandbox/$sandboxTab"
    | "/$owner/$repo/projects/$numId/sandbox/$sandboxTab";
  params: {
    owner: string;
    repo: string;
    numId: string;
    sandboxTab: "artifacts";
  };
} | null {
  if (source.numId === undefined) return null;
  const params = {
    owner: source.owner,
    repo: encodeRepoParam(source.repo, source.rootDirectory),
    numId: String(source.numId),
    sandboxTab: "artifacts" as const,
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
