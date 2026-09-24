import type { Id } from "@eva/backend";
import { Button, Collapsible, CollapsibleContent, Spinner } from "@eva/ui";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconPlayerStop,
  IconX,
} from "@tabler/icons-react";

type SeededAppResult = {
  repoId: Id<"githubRepos">;
  app?: string;
  status?: "running" | "seeded" | "fallback";
  seededSnapshotName: string | null;
};

/** A per-app entry counts as seeded by explicit status, or (legacy rows) by name. */
function isSeededEntry(a: SeededAppResult): boolean {
  return a.status ? a.status === "seeded" : a.seededSnapshotName !== null;
}

export function BuildRow({
  build,
  isExpanded,
  duration,
  cancelling = false,
  onCancel,
  onToggle,
}: {
  build: {
    _id: Id<"snapshotBuilds">;
    status: "running" | "success" | "error";
    triggeredBy: "cron" | "manual";
    kind?: "base" | "seeded";
    provider: "vercel";
    logs: string;
    error?: string;
    startedAt: number;
    completedAt?: number;
    seededApps?: SeededAppResult[];
  };
  isExpanded: boolean;
  duration: string;
  cancelling?: boolean;
  onCancel?: () => void;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="cursor-pointer hover:bg-muted/30" onClick={onToggle}>
        <td className="px-2 py-2 sm:px-4">
          {/* The row keeps its click target, but the disclosure also needs to be
              a real control so it is reachable by keyboard and screen reader.
              `stopPropagation` stops the row handler undoing this one. */}
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label="Build details"
            className="max-sm:hit-target flex items-center justify-center text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {isExpanded ? (
              <IconChevronDown size={14} />
            ) : (
              <IconChevronRight size={14} />
            )}
          </button>
        </td>
        <td className="px-2 py-2 sm:px-4">
          {new Date(build.startedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </td>
        <td className="px-2 py-2 sm:px-4">{duration}</td>
        <td className="px-2 py-2 capitalize sm:px-4">{build.triggeredBy}</td>
        <td className="px-2 py-2 sm:px-4">
          <ProviderBadge />
        </td>
        <td className="px-2 py-2 sm:px-4">
          <BuildKindBadge kind={build.kind} />
        </td>
        <td className="px-2 py-2 sm:px-4">
          <BuildStatusBadge status={build.status} />
        </td>
        <td className="px-2 py-2 sm:px-4">
          <div className="flex items-center gap-2">
            <SeededSummary seededApps={build.seededApps} />
            {onCancel ? (
              <Button
                size="sm"
                variant="destructive"
                className="h-6 px-2 text-[10px]"
                disabled={cancelling}
                onClick={(event) => {
                  event.stopPropagation();
                  onCancel();
                }}
              >
                {cancelling ? (
                  <Spinner size="sm" className="mr-1" />
                ) : (
                  <IconPlayerStop size={12} className="mr-1" />
                )}
                Cancel
              </Button>
            ) : null}
          </div>
        </td>
      </tr>
      <tr>
        <td colSpan={8} className="p-0">
          <Collapsible open={isExpanded}>
            <CollapsibleContent>
              <div className="px-4 py-3">
                {build.error && (
                  <div className="mb-2 rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {build.error}
                  </div>
                )}
                {build.seededApps && build.seededApps.length > 0 && (
                  <div className="mb-2 space-y-1 text-xs">
                    {build.seededApps.map((a) => (
                      <div key={a.repoId} className="flex items-start gap-2">
                        {a.status === "running" ? (
                          <span className="inline-flex items-center gap-1 text-blue-500">
                            <Spinner size="sm" className="size-3 shrink-0" />
                            {a.app ?? a.repoId} — seeding…
                          </span>
                        ) : a.seededSnapshotName ? (
                          <>
                            <span className="inline-flex shrink-0 items-center gap-1 text-green-500">
                              <IconCheck size={12} className="shrink-0" />
                              {a.app ?? a.repoId}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-mono break-all text-muted-foreground">
                                {a.seededSnapshotName}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span className="inline-flex items-start gap-1 text-muted-foreground">
                            <IconX size={12} className="mt-0.5 shrink-0" />
                            <span className="wrap-break-word">
                              {a.app ?? a.repoId} — fell back to base Image
                            </span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {build.logs ? (
                  <pre className="max-h-64 overflow-y-auto overflow-x-hidden scroll-fade rounded bg-muted/50 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all sm:p-3 sm:text-[11px]">
                    {build.logs}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No logs available.
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </td>
      </tr>
    </>
  );
}

export function BuildStatusBadge({
  status,
}: {
  status: "running" | "success" | "error";
}) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 text-blue-500">
        <IconClock size={12} />
        Running
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <IconCheck size={12} />
        Success
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-destructive">
      <IconX size={12} />
      Error
    </span>
  );
}

/** Sandbox provider badge with tooltip. */
function ProviderBadge() {
  return (
    <div className="group relative inline-flex">
      <span className="inline-flex items-center gap-1 rounded-surface bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600">
        ▲ Vercel
      </span>
      <div className="absolute bottom-full mb-1 hidden whitespace-nowrap rounded bg-foreground px-2 py-1 text-[10px] text-background group-hover:block">
        Vercel sandbox provider
      </div>
    </div>
  );
}

/** Build type badge: "Base image" (foundation only) vs "Seeded" (boots + seeds DB). */
function BuildKindBadge({ kind }: { kind?: "base" | "seeded" }) {
  if (!kind) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }
  if (kind === "seeded") {
    return (
      <span className="inline-flex items-center rounded-surface bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
        Seeded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-surface bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      Base image
    </span>
  );
}

/** Compact per-build seeding summary: seeded/total, coloured by completeness. */
function SeededSummary({ seededApps }: { seededApps?: SeededAppResult[] }) {
  if (!seededApps || seededApps.length === 0) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }
  const total = seededApps.length;
  const seeded = seededApps.filter(isSeededEntry).length;
  // Still seeding: show a spinner with progress so far.
  if (seededApps.some((a) => a.status === "running")) {
    return (
      <span className="inline-flex items-center gap-1 text-blue-500">
        <Spinner size="sm" className="size-3" />
        {seeded}/{total}
      </span>
    );
  }
  const color =
    seeded === total
      ? "text-green-500"
      : seeded === 0
        ? "text-destructive"
        : "text-amber-500";
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      {seeded}/{total}
    </span>
  );
}
