"use client";

import { Link } from "@tanstack/react-router";
import { IconAlertCircle } from "@tabler/icons-react";
import { Button } from "@vvedantb/ui";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

interface EntityNotFoundProps {
  /** Singular label used in copy, e.g. "task", "session", "document". */
  entityLabel: string;
  description?: string;
  /** Absolute or app path to navigate back to the list/index. */
  backTo?: string;
  backLabel?: string;
}

/**
 * Shared empty state when a URL points at a missing or deleted entity.
 * Prefer this over a blank pane or a bare "Not found" string.
 */
export function EntityNotFound({
  entityLabel,
  description = "It may have been deleted, or the link could be wrong.",
  backTo,
  backLabel,
}: EntityNotFoundProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center p-4">
      <EmptyState
        icon={<IconAlertCircle size={28} />}
        title={`This ${entityLabel} does not exist`}
        description={description}
        action={
          backTo ? (
            <Button asChild size="sm" variant="outline" className="mt-5">
              <Link to={toInternalRepoHref(backTo)}>
                {backLabel ?? `Back to ${entityLabel}s`}
              </Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
