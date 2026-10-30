"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api, DEFAULT_AI_MODEL, normalizeAIModel, type Id } from "@eva/backend";
import { Button, Spinner } from "@vvedantb/ui";
import { storedRunTraits, toRunTraitArgs } from "@/lib/utils/runTraits";
import { withMutationToast } from "@/lib/utils/mutationToast";

type Doc = NonNullable<FunctionReturnType<typeof api.docs.get>>;

/**
 * Regenerate for a recap opened in Documents, which has no model picker: it
 * reruns with the model and traits that produced the current recap.
 */
export function DocRecapRegenerateButton({
  doc,
  prUrl,
  repoId,
}: {
  doc: Doc;
  prUrl: string;
  repoId: Id<"githubRepos">;
}) {
  const generatePrRecap = useAction(api.docs.generatePrRecap);
  const [busy, setBusy] = useState(false);

  const regenerate = async () => {
    setBusy(true);
    try {
      await withMutationToast(
        generatePrRecap({
          repoId,
          prUrl,
          model: normalizeAIModel(doc.prRecapModel ?? DEFAULT_AI_MODEL),
          ...toRunTraitArgs(storedRunTraits(doc)),
        }),
        "Recap regeneration started",
        "Couldn't regenerate recap",
        "doc-regenerate-recap",
      );
    } catch {
      // The toast already reported it.
    }
    setBusy(false);
  };

  return (
    <Button
      size="sm"
      variant="secondary"
      className="h-7 shrink-0"
      disabled={busy}
      onClick={() => void regenerate()}
    >
      {busy ? <Spinner size="sm" /> : null}
      Regenerate
    </Button>
  );
}
