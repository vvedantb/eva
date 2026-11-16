"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useNavigate } from "@tanstack/react-router";
import {
  isSnapshotSettingsTab,
  type SnapshotSettingsTab,
} from "@/lib/search-params";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import {
  Button,
  CenteredSpinner,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  tokenTransition,
  SettingsSection,
  SettingsEmptyState,
} from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { EvaConfigSection } from "@/lib/components/evaConfig/EvaConfigSection";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { CronScheduleCard } from "@/lib/components/CronScheduleCard";
import { IconCamera, IconTrash } from "@tabler/icons-react";
import { formatDurationMs } from "@eva/shared/duration";
import { RebuildRequiredWarning } from "./_components/RebuildRequiredWarning";
import { BuildRow } from "./_components/BuildRow";
import { SnapshotStatusTab } from "./_components/SnapshotStatusTab";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

/** Every command box on this page is a monospace, resizable textarea. */

/**
 * Shown on the Status and Builds tabs when no snapshot config exists yet —
 * both tabs are empty until the Configuration tab has been filled in.
 */
function NoSnapshotConfigured() {
  return (
    <div className="rounded-surface bg-card">
      <SettingsEmptyState
        icon={IconCamera}
        title="No snapshot configured"
        description="Set a schedule and build commands on the Configuration tab to get started."
      />
    </div>
  );
}

type Snapshot = NonNullable<
  FunctionReturnType<typeof api.repoSnapshots.getRepoSnapshot>
>;
type Builds = FunctionReturnType<typeof api.repoSnapshots.listBuilds>;

function SnapshotsTabsNav({
  activeTab,
  onValueChange,
}: {
  activeTab: SnapshotSettingsTab;
  onValueChange: (value: string) => void;
}) {
  return (
    <Tabs value={activeTab} onValueChange={onValueChange}>
      <TabsList>
        <TabsTrigger value="configuration">Configuration</TabsTrigger>
        <TabsTrigger value="status">Status</TabsTrigger>
        <TabsTrigger value="builds">Builds</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function SnapshotsClient({
  activeTab,
}: {
  activeTab: SnapshotSettingsTab;
}) {
  const navigate = useNavigate();
  const { repoId, basePath } = useRepo();
  const snapshot = useQuery(api.repoSnapshots.getRepoSnapshot, { repoId });
  const builds = useQuery(
    api.repoSnapshots.listBuilds,
    snapshot ? { repoSnapshotId: snapshot._id } : "skip",
  );
  const seededApps = useQuery(
    api.repoSnapshots.getSeededAppStatus,
    snapshot ? { repoSnapshotId: snapshot._id } : "skip",
  );
  const deleteRepoSnapshot = useMutation(api.repoSnapshots.deleteRepoSnapshot);
  const startBuild = useMutation(api.repoSnapshots.startBuild);
  const cancelBuild = useMutation(api.repoSnapshots.cancelBuild);

  // UI-only state (not data)
  const [building, setBuilding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expandedBuild, setExpandedBuild] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!snapshot) return;
    try {
      await withMutationToast(
        deleteRepoSnapshot({ repoSnapshotId: snapshot._id }),
        "Snapshot config deleted",
        "Couldn't delete snapshot config",
        "snapshot-config-delete",
      );
    } catch {
      // Toast already shown.
    }
  };

  const handleRebuild = async () => {
    if (!snapshot) return;
    setBuilding(true);
    try {
      await startBuild({ repoSnapshotId: snapshot._id, appRepoId: repoId });
    } catch {
      // Error already shown in UI via build status
    }
    setBuilding(false);
  };

  const handleCancelBuild = async (buildId: Id<"snapshotBuilds">) => {
    setCancelling(true);
    try {
      await catchMutationError(
        cancelBuild({ buildId }),
        "Couldn't cancel build",
        "snapshot-build-cancel",
      );
    } catch {
      // Toast already shown; the build row still shows its live status.
    }
    setCancelling(false);
  };

  const handleSnapshotsTabChange = (value: string) => {
    if (!isSnapshotSettingsTab(value)) return;
    navigate({
      to: toInternalRepoHref(`${basePath}/settings/snapshots/${value}`),
    });
  };

  const tabs = (
    <SnapshotsTabsNav
      activeTab={activeTab}
      onValueChange={handleSnapshotsTabChange}
    />
  );

  if (snapshot === undefined) {
    return (
      <SettingsPage title="Snapshots" tabs={tabs}>
        <CenteredSpinner label="Loading snapshots" className="min-h-112" />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title="Snapshots"
      headerRight={
        snapshot && activeTab === "configuration" ? (
          <Button size="sm" variant="destructive" onClick={handleDelete}>
            <IconTrash size={14} className="mr-1.5" />
            Delete Config
          </Button>
        ) : null
      }
      tabs={tabs}
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={tokenTransition.fast}
        >
          {activeTab === "configuration" ? (
            <SnapshotConfigurationTab repoId={repoId} snapshot={snapshot} />
          ) : null}

          {activeTab === "status" ? (
            snapshot ? (
              <SnapshotStatusTab
                snapshot={snapshot}
                builds={builds}
                seededApps={seededApps}
                building={building}
                cancelling={cancelling}
                onRebuild={handleRebuild}
                onCancelBuild={handleCancelBuild}
              />
            ) : (
              <NoSnapshotConfigured />
            )
          ) : null}

          {activeTab === "builds" ? (
            <SnapshotBuildsTab
              snapshot={snapshot}
              builds={builds}
              expandedBuild={expandedBuild}
              onExpandedBuildChange={setExpandedBuild}
              cancelling={cancelling}
              onCancelBuild={handleCancelBuild}
            />
          ) : null}
        </m.div>
      </AnimatePresence>
    </SettingsPage>
  );
}

/** Configuration tab: schedule, build branch and command boxes, saved on change/blur. */
function SnapshotConfigurationTab({
  repoId,
  snapshot,
}: {
  repoId: Id<"githubRepos">;
  snapshot: Snapshot | null;
}) {
  const { repo } = useRepo();
  const saveRepoSnapshot = useMutation(api.repoSnapshots.saveRepoSnapshot);
  const setSnapshotEnabled = useMutation(api.repoSnapshots.setSnapshotEnabled);

  // Derive values directly from Convex
  const schedule = snapshot?.schedule ?? "manual";
  // Snapshots build from the repo's default branch (the branch `.eva/` syncs from).
  const buildBranch = repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const isEnabled = snapshot?.enabled === true;

  const handleScheduleChange = (newSchedule: string) => {
    saveRepoSnapshot({ repoId, schedule: newSchedule });
  };

  return (
    <>
      <CronScheduleCard
        value={schedule}
        onChange={handleScheduleChange}
        allowManual
      />

      <SettingsSection
        title="Branch"
        description="When disabled, scheduled rebuilds are paused. Manual rebuilds still work."
        action={
          snapshot ? (
            <Switch
              checked={isEnabled}
              onCheckedChange={(enabled) =>
                setSnapshotEnabled({
                  repoSnapshotId: snapshot._id,
                  enabled,
                })
              }
              aria-label="Scheduled rebuilds enabled"
            />
          ) : null
        }
      >
        <p className="text-sm text-foreground">
          Builds from <code>{buildBranch}</code>, the repo&apos;s default
          branch.
        </p>
      </SettingsSection>

      {snapshot && <RebuildRequiredWarning />}

      <EvaConfigSection />

      <p className="text-xs leading-relaxed text-muted-foreground">
        Requires Vercel Sandbox credentials:{" "}
        <code className="font-mono">VERCEL_TOKEN</code> and{" "}
        <code className="font-mono">VERCEL_TEAM_ID</code> (team or repo), and{" "}
        <code className="font-mono">VERCEL_PROJECT_ID</code> on this app — not
        borrowed from a sibling repo.
      </p>
    </>
  );
}

function formatBuildDuration(build: Builds[number]) {
  if (build.completedAt) {
    return formatDurationMs(build.completedAt - build.startedAt);
  }
  return build.status === "running" ? "Running..." : "-";
}

/** Builds tab: build history table, or an empty state. */
function SnapshotBuildsTab({
  snapshot,
  builds,
  expandedBuild,
  onExpandedBuildChange,
  cancelling,
  onCancelBuild,
}: {
  snapshot: Snapshot | null;
  builds: Builds | undefined;
  expandedBuild: string | null;
  onExpandedBuildChange: (buildId: string | null) => void;
  cancelling: boolean;
  onCancelBuild: (buildId: Id<"snapshotBuilds">) => void;
}) {
  return (
    <>
      {snapshot && builds && builds.length > 0 ? (
        // Rows own their padding so the table spans the card's full width.
        <SettingsSection title="Build History" bodyVariant="list">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:min-w-[420px] max-sm:min-w-[620px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium w-8 sm:px-4" />
                  <th className="px-2 py-2 font-medium sm:px-4">Date</th>
                  <th className="px-2 py-2 font-medium sm:px-4">Duration</th>
                  <th className="px-2 py-2 font-medium sm:px-4">Trigger</th>
                  <th className="px-2 py-2 font-medium sm:px-4">Provider</th>
                  <th className="px-2 py-2 font-medium sm:px-4">Type</th>
                  <th className="px-2 py-2 font-medium sm:px-4">Status</th>
                  <th className="px-2 py-2 font-medium sm:px-4">Seeded</th>
                </tr>
              </thead>
              <tbody>
                {builds.map((build) => {
                  const isExpanded = expandedBuild === build._id;
                  const duration = formatBuildDuration(build);
                  return (
                    <BuildRow
                      key={build._id}
                      build={build}
                      isExpanded={isExpanded}
                      duration={duration}
                      cancelling={cancelling}
                      onCancel={
                        build.status === "running"
                          ? () => onCancelBuild(build._id)
                          : undefined
                      }
                      onToggle={() =>
                        onExpandedBuildChange(isExpanded ? null : build._id)
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </SettingsSection>
      ) : snapshot && builds && builds.length === 0 ? (
        <SettingsSection title="Build History" bodyVariant="list">
          <SettingsEmptyState
            icon={IconCamera}
            title="No builds yet"
            description="Select Rebuild Now on the Status tab to run the first build."
          />
        </SettingsSection>
      ) : (
        <NoSnapshotConfigured />
      )}
    </>
  );
}
