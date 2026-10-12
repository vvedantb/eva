import type { Id } from "@eva/backend";
import type { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { Button, Spinner } from "@eva/ui";
import { IconCheck, IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { describeCron } from "@/lib/components/CronScheduleCard";
import { BuildStatusBadge } from "./BuildRow";

type Snapshot = NonNullable<
  FunctionReturnType<typeof api.repoSnapshots.getRepoSnapshot>
>;
type Builds = FunctionReturnType<typeof api.repoSnapshots.listBuilds>;
type Build = Builds[number];
type SeededApps = FunctionReturnType<
  typeof api.repoSnapshots.getSeededAppStatus
>;

/** Derives the build/seed state shown on the Status tab. */
function getSnapshotBuildStatus(
  snapshot: Snapshot,
  builds: Builds | undefined,
  seededApps: SeededApps | undefined,
) {
  const isRunning =
    builds && builds.length > 0 && builds[0].status === "running";
  const lastBuild = builds && builds.length > 0 ? builds[0] : null;
  // Base image is marked success before Step 5 seeding runs, so "in progress"
  // must also cover an ongoing seed (any app still in the "running" state).
  const isSeeding = (lastBuild?.seededApps ?? []).some(
    (a) => a.status === "running",
  );
  // The build now produces a single seeded snapshot shared by every app in the
  // repo, so the per-app rows all carry the same seededSnapshotName. Take the
  // first seeded entry as the one shared snapshot.
  const sharedSeededSnapshotName =
    seededApps?.find((app) => app.seededSnapshotName !== null)
      ?.seededSnapshotName ?? null;
  const hasSeedableApps = (seededApps?.length ?? 0) > 0;
  const activeBaseSnapshotId =
    snapshot.baseSnapshotId ?? snapshot.snapshotName ?? null;
  const baseImageReady =
    lastBuild?.status === "success" && !isRunning && !isSeeding;
  return {
    isRunning,
    lastBuild,
    isSeeding,
    sharedSeededSnapshotName,
    hasSeedableApps,
    activeBaseSnapshotId,
    baseImageReady,
  };
}

function formatSchedule(schedule: string) {
  if (schedule === "manual") return "Manual";
  const result = describeCron(schedule);
  return result.valid ? result.text : schedule;
}

/** Status tab body; only rendered once a snapshot config exists. */
export function SnapshotStatusTab({
  snapshot,
  builds,
  seededApps,
  building,
  cancelling,
  onRebuild,
  onCancelBuild,
}: {
  snapshot: Snapshot;
  builds: Builds | undefined;
  seededApps: SeededApps | undefined;
  building: boolean;
  cancelling: boolean;
  onRebuild: () => void;
  onCancelBuild: (buildId: Id<"snapshotBuilds">) => void;
}) {
  const {
    isRunning,
    lastBuild,
    isSeeding,
    sharedSeededSnapshotName,
    hasSeedableApps,
    activeBaseSnapshotId,
    baseImageReady,
  } = getSnapshotBuildStatus(snapshot, builds, seededApps);

  return (
    <>
      <SettingsSection title="Current Status">
        <CurrentStatusGrid snapshot={snapshot} lastBuild={lastBuild} />
        <RebuildActions
          building={building}
          isRunning={isRunning}
          isSeeding={isSeeding}
          lastBuild={lastBuild}
          cancelling={cancelling}
          onRebuild={onRebuild}
          onCancelBuild={onCancelBuild}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Always rebuilds the base Image below.
          {hasSeedableApps
            ? " Also re-captures the optional seeded snapshot when apps have Stop Commands."
            : " No seed file or Stop Commands required."}
        </p>
        {lastBuild?.status === "error" && lastBuild.error ? (
          <p className="text-xs leading-relaxed text-destructive">
            {lastBuild.error}
          </p>
        ) : null}
      </SettingsSection>
      <SettingsSection
        title="Images"
        description={
          <>
            Base snapshot with toolchain, <code>pnpm install</code>, and
            your build commands. Eva captures a running sandbox as{" "}
            <code>snap_*</code>. This is what sandboxes boot from unless
            a seeded snapshot exists.
          </>
        }
      >
        <div>
          <h4 className="text-xs font-medium text-foreground">
            Base Image
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Rebuild Now always refreshes this — no seed file needed.
          </p>
          <div className="mt-3">
            <BaseImageStatus
              snapshot={snapshot}
              lastBuild={lastBuild}
              isRunning={isRunning}
              baseImageReady={baseImageReady}
              activeBaseSnapshotId={activeBaseSnapshotId}
            />
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-xs font-medium text-foreground">
            Seeded snapshot{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Running-sandbox capture with DB and services already
            started. Only needed when cold boot is too slow. Configure
            Stop Commands on an app (Settings → App); upload seed files
            only if startup commands reference them.
          </p>
          <div className="mt-3">
            <SeededSnapshotStatus
              seededApps={seededApps}
              isSeeding={isSeeding}
              sharedSeededSnapshotName={sharedSeededSnapshotName}
              hasSeedableApps={hasSeedableApps}
            />
          </div>
        </div>
      </SettingsSection>
    </>
  );
}

function CurrentStatusGrid({
  snapshot,
  lastBuild,
}: {
  snapshot: Snapshot;
  lastBuild: Build | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 sm:gap-4">
      <div>
        <span className="text-muted-foreground">Snapshot Name</span>
        <p className="font-mono mt-0.5 max-sm:break-all">
          {snapshot.snapshotName}
        </p>
      </div>
      <div>
        <span className="text-muted-foreground">Schedule</span>
        <p className="mt-0.5">{formatSchedule(snapshot.schedule)}</p>
      </div>
      <div>
        <span className="text-muted-foreground">Clone Branch</span>
        <p className="font-mono mt-0.5 max-sm:break-all">
          {snapshot.workflowRef ?? "main"}
        </p>
      </div>
      {lastBuild && (
        <>
          <div>
            <span className="text-muted-foreground">
              Last Build
            </span>
            <p className="mt-0.5">
              {new Date(lastBuild.startedAt).toLocaleDateString(
                "en-GB",
                {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              )}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Status</span>
            <p className="mt-0.5">
              <BuildStatusBadge status={lastBuild.status} />
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function RebuildActions({
  building,
  isRunning,
  isSeeding,
  lastBuild,
  cancelling,
  onRebuild,
  onCancelBuild,
}: {
  building: boolean;
  isRunning: boolean | undefined;
  isSeeding: boolean;
  lastBuild: Build | null;
  cancelling: boolean;
  onRebuild: () => void;
  onCancelBuild: (buildId: Id<"snapshotBuilds">) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        onClick={onRebuild}
        disabled={building || isRunning || isSeeding}
      >
        {building || isRunning || isSeeding ? (
          <Spinner size="sm" className="mr-1.5" />
        ) : (
          <IconPlayerPlay size={14} className="mr-1.5" />
        )}
        {building || isRunning
          ? "Building..."
          : isSeeding
            ? "Seeding..."
            : "Rebuild Now"}
      </Button>
      {isRunning && lastBuild ? (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onCancelBuild(lastBuild._id)}
          disabled={cancelling}
        >
          {cancelling ? (
            <Spinner size="sm" className="mr-1.5" />
          ) : (
            <IconPlayerStop size={14} className="mr-1.5" />
          )}
          Cancel Build
        </Button>
      ) : null}
    </div>
  );
}

function BaseImageStatus({
  snapshot,
  lastBuild,
  isRunning,
  baseImageReady,
  activeBaseSnapshotId,
}: {
  snapshot: Snapshot;
  lastBuild: Build | null;
  isRunning: boolean | undefined;
  baseImageReady: boolean;
  activeBaseSnapshotId: string | null;
}) {
  if (baseImageReady) {
    return (
      <div className="flex items-start gap-1 text-xs text-green-500">
        <IconCheck size={12} className="mt-0.5 shrink-0" />
        <span className="min-w-0">
          <span className="mr-1 text-muted-foreground">
            Active:
          </span>
          <span className="font-mono break-all text-foreground">
            {activeBaseSnapshotId}
          </span>
        </span>
      </div>
    );
  }
  if (isRunning) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-500">
        <Spinner size="sm" />
        Building base Image…
      </span>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      {snapshot.baseSnapshotId ? (
        <>
          Last active:{" "}
          <span className="font-mono break-all">
            {snapshot.baseSnapshotId}
          </span>
          {" — "}
        </>
      ) : null}
      Config name:{" "}
      <span className="font-mono max-sm:break-all">
        {snapshot.snapshotName}
      </span>
      {lastBuild?.status === "error"
        ? " — last build failed; click Rebuild Now to retry."
        : " — not built yet; click Rebuild Now."}
    </p>
  );
}

function SeededSnapshotStatus({
  seededApps,
  isSeeding,
  sharedSeededSnapshotName,
  hasSeedableApps,
}: {
  seededApps: SeededApps | undefined;
  isSeeding: boolean;
  sharedSeededSnapshotName: string | null;
  hasSeedableApps: boolean;
}) {
  if (seededApps === undefined) {
    return <p className="text-xs text-muted-foreground">Loading…</p>;
  }
  if (isSeeding) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-500">
        <Spinner size="sm" />
        Capturing seeded snapshot…
      </span>
    );
  }
  if (sharedSeededSnapshotName) {
    return (
      <div className="flex items-start gap-1 text-xs text-green-500">
        <IconCheck size={12} className="mt-0.5 shrink-0" />
        <span className="min-w-0">
          <span className="mr-1 text-muted-foreground">
            Active:
          </span>
          <span className="font-mono max-sm:break-all">
            {sharedSeededSnapshotName}
          </span>
        </span>
      </div>
    );
  }
  if (!hasSeedableApps) {
    return (
      <p className="text-xs text-muted-foreground">
        Not configured — no apps have Stop Commands. Sandboxes
        use the base Image only, which is fine for most repos.
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      Not captured yet — run Rebuild Now after configuring app
      startup/background/stop commands.
    </p>
  );
}
