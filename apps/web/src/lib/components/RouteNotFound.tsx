"use client";

import { Link } from "@tanstack/react-router";
import { IconMapSearch } from "@tabler/icons-react";
import { Button } from "@eva/ui";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { useSearch } from "@/lib/contexts/SearchContext";

/**
 * Router-level 404. Registered as `defaultNotFoundComponent` in `main.tsx`, so
 * any unmatched URL lands here instead of on a blank canvas.
 *
 * `useSearch` has a no-provider fallback, which matters: a 404 can render above
 * the signed-in shell (mistyped path while signed out), where spotlight does
 * not exist. `EntityNotFound` stays the answer for a *matched* route whose
 * entity is missing — this one is for a path the router never knew.
 */
export function RouteNotFound() {
  const { openSearch } = useSearch();

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-background p-4">
      <EmptyState
        icon={<IconMapSearch size={28} />}
        title="This page doesn't exist"
        description="The link may be wrong or the page may have moved."
        action={
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button asChild size="sm">
              <Link to="/home">Go home</Link>
            </Button>
            <Button size="sm" variant="secondary" onClick={openSearch}>
              Search
            </Button>
          </div>
        }
      />
    </div>
  );
}
