"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { diffWords } from "diff";
import { Spinner, Button, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";

export function DocVersionDiff({
  versionId,
  currentContent,
  onRestore,
}: {
  versionId: Id<"docVersions">;
  currentContent: string;
  onRestore: (pmContent: string) => void;
}) {
  const version = useQuery(api.docVersions.get, { id: versionId });

  if (version === undefined) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  if (version === null) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Version not found.
      </p>
    );
  }

  const changes = diffWords(version.content, currentContent);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-sm:flex-wrap items-center justify-between max-sm:gap-2">
        <span className="text-xs text-muted-foreground">
          Comparing selected version with current
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onRestore(version.pmContent)}
        >
          Restore this version
        </Button>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <m.pre
          key={versionId}
          className="whitespace-pre-wrap max-sm:wrap-break-word rounded-surface border border-border bg-muted/30 p-3 text-sm leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionFast}
        >
          {changes.map((part, i) => {
            if (part.added) {
              return (
                <ins
                  key={i}
                  className="bg-green-500/20 text-green-700 dark:text-green-400 no-underline"
                >
                  {part.value}
                </ins>
              );
            }
            if (part.removed) {
              return (
                <del
                  key={i}
                  className="bg-red-500/20 text-red-700 dark:text-red-400"
                >
                  {part.value}
                </del>
              );
            }
            return <span key={i}>{part.value}</span>;
          })}
        </m.pre>
      </AnimatePresence>
    </div>
  );
}
