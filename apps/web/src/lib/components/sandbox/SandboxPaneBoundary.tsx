"use client";

import type { ReactNode } from "react";
import { Button, ErrorBoundary } from "@vvedantb/ui";
import { IconAlertTriangle } from "@tabler/icons-react";

interface SandboxPaneBoundaryProps {
  /** Pane name shown in the fallback, e.g. "Review". */
  label: string;
  children: ReactNode;
}

/**
 * Isolates one sandbox pane. Every pane stays mounted (hidden) so switching tabs
 * keeps its state, which also means a render error in any pane would otherwise
 * unmount the whole sandbox — a broken diff tree took Preview down with it. The
 * failing pane now shows its own retry instead.
 */
export function SandboxPaneBoundary({
  label,
  children,
}: SandboxPaneBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={(retry) => (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <IconAlertTriangle className="h-8 w-8 text-muted-foreground/60" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{label} hit an error</p>
            <p className="text-sm text-muted-foreground">
              The rest of the sandbox is unaffected.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
