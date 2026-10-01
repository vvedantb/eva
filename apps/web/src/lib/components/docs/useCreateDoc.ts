import { useConvex, useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { mutationError } from "@/lib/utils/mutationToast";
import type { ChatSourceArg } from "@/lib/components/sandbox/chatSource";

/**
 * Creates a doc and resolves it (`_id`, `numId`, …), or null after showing an
 * error toast. Shared by the Documents sidebar and the sandbox Documents tab.
 */
export function useCreateDoc() {
  const convex = useConvex();
  const createDoc = useMutation(api.docs.create);

  return async (args: {
    repoId: Id<"githubRepos">;
    title: string;
    content: string;
    source?: ChatSourceArg;
  }) => {
    try {
      const id = await createDoc(args);
      return await convex.query(api.docs.get, { id });
    } catch {
      mutationError("Couldn't create the document. Try again.", "doc-create");
      return null;
    }
  };
}
