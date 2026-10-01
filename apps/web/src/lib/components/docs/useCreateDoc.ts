import { useConvex, useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { DOC_VIEWER_DEFAULT_TAB } from "@/lib/search-params";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import type { DocSourceArg } from "./_source";

/**
 * Creates a doc and resolves its per-repo numId (null if it has none). Shared
 * by the Documents sidebar and the sandbox Documents tab; throws when the
 * mutation fails.
 */
export function useCreateDoc() {
  const convex = useConvex();
  const createDoc = useMutation(api.docs.create);

  return async (args: {
    repoId: Id<"githubRepos">;
    title: string;
    content: string;
    source?: DocSourceArg;
  }): Promise<number | null> => {
    const id = await createDoc(args);
    const created = await convex.query(api.docs.get, { id });
    return created?.numId ?? null;
  };
}

/** Navigates to a doc in the repo Documents viewer. */
export function useOpenDocInViewer(basePath: string) {
  const navigate = useNavigate();
  return (numId: number) =>
    navigate({
      to: toInternalRepoHref(
        `${basePath}/docs/${numId}/${DOC_VIEWER_DEFAULT_TAB}`,
      ),
      search: (prev) => prev,
    });
}
