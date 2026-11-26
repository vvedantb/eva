"use client";

import { Spinner } from "@vvedantb/ui";
import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import type { EntityResolveResult } from "@/lib/numId";

/**
 * Renders the four states of a numId route: legacy-id redirect, loading,
 * not-found, and the resolved document. Every numId detail route funnels
 * through here so the states stay identical across surfaces.
 */
export function EntityNumIdGate<TDoc extends { _id: string }>({
  resolve,
  entityLabel,
  backTo,
  backLabel,
  children,
}: {
  resolve: EntityResolveResult<TDoc>;
  entityLabel: string;
  backTo?: string;
  backLabel?: string;
  children: (doc: TDoc) => ReactNode;
}) {
  if (resolve.redirectTo !== null) {
    return <Navigate to={resolve.redirectTo} search={true} replace />;
  }

  if (resolve.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (resolve.status === "not-found" || resolve.doc === null) {
    return (
      <EntityNotFound
        entityLabel={entityLabel}
        backTo={backTo}
        backLabel={backLabel}
      />
    );
  }

  return children(resolve.doc);
}
