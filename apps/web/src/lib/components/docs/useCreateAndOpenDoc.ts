import { useConvex, useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { DOC_VIEWER_DEFAULT_TAB } from "@/lib/search-params";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import type { DocSourceArg } from "./_source";

/**
 * Creates a doc and opens it in the repo Documents viewer. Shared by the
 * Documents sidebar and the sandbox Documents tab. Resolves true once the
 * viewer is open; throws when the mutation fails.
 */
export function useCreateAndOpenDoc(basePath: string) {
  const convex = useConvex();
  const navigate = useNavigate();
  const createDoc = useMutation(api.docs.create);

  return async (args: {
    repoId: Id<"githubRepos">;
    title: string;
    content: string;
    source?: DocSourceArg;
  }): Promise<boolean> => {
    const id = await createDoc(args);
    const created = await convex.query(api.docs.get, { id });
    if (!created) return false;
    const segment = entityPathSegment(created);
    if (!segment) return false;
    void navigate({
      to: toInternalRepoHref(
        `${basePath}/docs/${segment}/${DOC_VIEWER_DEFAULT_TAB}`,
      ),
      search: (prev) => prev,
    });
    return true;
  };
}
