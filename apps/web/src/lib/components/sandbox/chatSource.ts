import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { encodeRepoParam } from "@/lib/utils/repoUrl";

/**
 * The chat (session / quick task / project) a doc or artifact was created
 * from. Backend: `convex/_chatSource/helpers.ts`; both tables share it.
 */

/** Chat to list or create rows for (`listForSource` / `create`). */
export type ChatSourceArg = FunctionArgs<
  typeof api.docs.listForSource
>["source"];

/** Resolved source on a doc or artifact row. */
export type ChatSource = NonNullable<
  FunctionReturnType<typeof api.docs.listForSource>[number]["source"]
>;

export type ChatSourceKind = ChatSource["kind"];

// The labels are shared with the phone Documents list.
export {
  chatSourceKindLabel,
  chatSourceLabel,
  chatSourceShortLabel,
} from "@eva/shared";

/** Route into the source chat's sandbox tab, or null when numId is missing. */
export function chatSourceRoute<Tab extends "documents" | "artifacts">(
  source: ChatSource,
  sandboxTab: Tab,
): {
  to:
    | "/$owner/$repo/sessions/$numId/$sandboxTab"
    | "/$owner/$repo/quick-tasks/$numId/sandbox/$sandboxTab"
    | "/$owner/$repo/projects/$numId/sandbox/$sandboxTab";
  params: { owner: string; repo: string; numId: string; sandboxTab: Tab };
} | null {
  if (source.numId === undefined) return null;
  const params = {
    owner: source.owner,
    repo: encodeRepoParam(source.repo, source.rootDirectory),
    numId: String(source.numId),
    sandboxTab,
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
