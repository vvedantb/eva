import { useState } from "react";
import { useMutation, useConvex } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate } from "@tanstack/react-router";
import { api, type Id } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { DOC_VIEWER_DEFAULT_TAB } from "@/lib/search-params";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

export function useSessionPlanDocument(sessionId: Id<"sessions">) {
  const { basePath } = useRepo();
  const navigate = useNavigate();
  const convex = useConvex();
  const updatePlanContent = useMutation(api.sessions.updatePlanContent);
  const createDocFromSession = useMutation(api.docs.createFromSession);
  const linkedDoc = useQuery(api.docs.getBySession, { sessionId });
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDoc, setIsSavingDoc] = useState(false);

  const savePlan = async (markdown: string) => {
    setIsSaving(true);
    try {
      await withMutationToast(
        updatePlanContent({
          id: sessionId,
          planContent: markdown,
        }),
        "Plan saved",
        "Couldn't save plan",
        "session-plan-save",
      );
    } catch {
      setIsSaving(false);
      throw new Error("Couldn't save plan");
    }
    setIsSaving(false);
  };

  const saveAsDocument = async () => {
    setIsSavingDoc(true);
    try {
      const docId = await catchMutationError(
        createDocFromSession({ sessionId }),
        "Couldn't save document",
        "session-plan-doc",
      );
      const doc = await convex.query(api.docs.get, { id: docId });
      // Nested ifs: React Compiler bails on a ternary inside try, and an early
      // return would skip the setIsSavingDoc(false) below.
      if (doc) {
        const segment = entityPathSegment(doc);
        if (segment) {
          await navigate({
            to: toInternalRepoHref(
              `${basePath}/docs/${segment}/${DOC_VIEWER_DEFAULT_TAB}`,
            ),
          });
        }
      }
    } catch {
      setIsSavingDoc(false);
      return;
    }
    setIsSavingDoc(false);
  };

  return {
    savePlan,
    saveAsDocument,
    saveAsDocumentLabel: linkedDoc ? "Update Document" : "Save as Document",
    isSaving,
    isSavingDoc,
  };
}
