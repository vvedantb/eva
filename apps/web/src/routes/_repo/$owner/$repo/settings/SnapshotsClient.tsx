"use client";

import { useState, useRef } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
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
  Spinner,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsField } from "@/lib/components/settings/SettingsField";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import { BranchSelect } from "@/lib/components/BranchSelect";
import {
  CronScheduleCard,
  describeCron,
} from "@/lib/components/CronScheduleCard";
import {
  IconCamera,
  IconCheck,
  IconFile,
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { formatDurationMs } from "@eva/shared/duration";
import { parseCommandLines, formatFileSize } from "./_utils";
import { RebuildRequiredWarning } from "./_components/RebuildRequiredWarning";
import { BuildRow, BuildStatusBadge } from "./_components/BuildRow";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { withMutationToast } from "@/lib/utils/mutationToast";

/** Every command box on this page is a monospace, resizable textarea. */
const COMMAND_TEXTAREA_CLASS = "resize-y bg-background font-mono text-xs";

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
  const saveRepoSnapshot = useMutation(api.repoSnapshots.saveRepoSnapshot);
  const deleteRepoSnapshot = useMutation(api.repoSnapshots.deleteRepoSnapshot);
  const startBuild = useMutation(api.repoSnapshots.startBuild);
  const cancelBuild = useMutation(api.repoSnapshots.cancelBuild);
  const setSnapshotEnabled = useMutation(api.repoSnapshots.setSnapshotEnabled);

  // UI-only state (not data)
  const [building, setBuilding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expandedBuild, setExpandedBuild] = useState<string | null>(null);

  // Derive values directly from Convex
  const schedule = snapshot?.schedule ?? "manual";
  const workflowRef = snapshot?.workflowRef ?? "main";
  const buildCommandsText = snapshot?.buildCommands?.join("\n") ?? "";
  const seedCommandsText = snapshot?.seedCommands?.join("\n") ?? "";
  const isEnabled = snapshot?.enabled === true;

  // Save on change for schedule
  const handleScheduleChange = (newSchedule: string) => {
    saveRepoSnapshot({
      repoId,
      schedule: newSchedule,
      workflowRef: workflowRef.trim() || undefined,
      buildCommands: snapshot?.buildCommands,
      seedCommands: snapshot?.seedCommands,
    });
  };

  // Save on change for branch
  const handleBranchChange = (newBranch: string) => {
    saveRepoSnapshot({
      repoId,
      schedule,
      workflowRef: newBranch.trim() || undefined,
      buildCommands: snapshot?.buildCommands,
      seedCommands: snapshot?.seedCommands,
    });
  };

  // Save on blur for build commands
  const handleBuildCommandsBlur = (
    e: React.FocusEvent<HTMLTextAreaElement>,
  ) => {
    const next = e.target.value;
    if (next === buildCommandsText) return;
    const parsed = parseCommandLines(next);
    saveRepoSnapshot({
      repoId,
      schedule,
      workflowRef: workflowRef.trim() || undefined,
      buildCommands: parsed.length > 0 ? parsed : undefined,
      seedCommands: snapshot?.seedCommands,
    });
  };

  // Save on blur for seed commands
  const handleSeedCommandsBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    if (next === seedCommandsText) return;
    const parsed = parseCommandLines(next);
    saveRepoSnapshot({
      repoId,
      schedule,
      workflowRef: workflowRef.trim() || undefined,
      buildCommands: snapshot?.buildCommands,
      seedCommands: parsed.length > 0 ? parsed : undefined,
    });
  };

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
      await cancelBuild({ buildId });
    } catch (error) {
      setCancelling(false);
      throw error;
    }
    setCancelling(false);
  };

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
    snapshot?.baseSnapshotId ?? snapshot?.snapshotName ?? null;
  const baseImageReady =
    lastBuild?.status === "success" && !isRunning && !isSeeding;

  const handleSnapshotsTabChange = (value: string) => {
    if (!isSnapshotSettingsTab(value)) return;
    navigate({
      to: toInternalRepoHref(`${basePath}/settings/snapshots/${value}`),
    });
  };

  if (snapshot === undefined) {
    return (
      <SettingsPage
        title="Snapshots"
        tabs={
          <Tabs value={activeTab} onValueChange={handleSnapshotsTabChange}>
            <TabsList>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
              <TabsTrigger value="status">Status</TabsTrigger>
              <TabsTrigger value="builds">Builds</TabsTrigger>
              <TabsTrigger value="config-files">Config Files</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
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
      tabs={
        <Tabs value={activeTab} onValueChange={handleSnapshotsTabChange}>
          <TabsList>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="builds">Builds</TabsTrigger>
            <TabsTrigger value="config-files">Config Files</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionFast}
        >
      {activeTab === "configuration" ? (
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
            <SettingsField
              label="Branch"
              description={
                <>
                  Branch to clone for the snapshot. Defaults to{" "}
                  <code>main</code>
                  if empty.
                </>
              }
            >
              <BranchSelect
                value={workflowRef}
                onValueChange={handleBranchChange}
                className="h-8 text-xs"
                placeholder="Select a branch"
              />
            </SettingsField>
          </SettingsSection>

          {snapshot && <RebuildRequiredWarning />}

          <SettingsSection title="Build Commands">
            <SettingsField
              label="Commands to run during snapshot build"
              description={
                <>
                  One command per line. Runs in <code>/tmp/repo</code> after{" "}
                  <code>pnpm install</code> and before services start. Use for
                  codegen and builds.
                </>
              }
            >
              <Textarea
                key={`build-${snapshot?._id ?? "none"}`}
                defaultValue={buildCommandsText}
                onBlur={handleBuildCommandsBlur}
                className={`h-48 ${COMMAND_TEXTAREA_CLASS}`}
                placeholder="pnpm convex codegen&#10;pnpm build"
              />
            </SettingsField>
          </SettingsSection>

          <SettingsSection title="Seed Commands">
            <SettingsField
              label="One-time data seeding, run with services up"
              description={
                <>
                  One command per line. Runs once per seeded build after
                  services start. Unlike startup commands, these do not run on
                  every sandbox boot.
                </>
              }
            >
              <Textarea
                key={`seed-${snapshot?._id ?? "none"}`}
                defaultValue={seedCommandsText}
                onBlur={handleSeedCommandsBlur}
                className={`h-48 ${COMMAND_TEXTAREA_CLASS}`}
                placeholder="cd packages/backend && npx convex env set MY_KEY 'value'&#10;cd packages/backend && npx convex import seed.zip --yes"
              />
            </SettingsField>
          </SettingsSection>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Requires Vercel Sandbox credentials:{" "}
            <code className="font-mono">VERCEL_TOKEN</code> and{" "}
            <code className="font-mono">VERCEL_TEAM_ID</code> (team or repo),
            and <code className="font-mono">VERCEL_PROJECT_ID</code> on this
            app — not borrowed from a sibling repo.
          </p>
        </>
      ) : null}

      {activeTab === "status" ? (
        <>
          {snapshot ? (
            <>
              <SettingsSection title="Current Status">
                <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 sm:gap-4">
                  <div>
                    <span className="text-muted-foreground">Snapshot Name</span>
                    <p className="font-mono mt-0.5 max-sm:break-all">
                      {snapshot.snapshotName}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Schedule</span>
                    <p className="mt-0.5">
                      {snapshot.schedule === "manual"
                        ? "Manual"
                        : (() => {
                            const result = describeCron(snapshot.schedule);
                            return result.valid
                              ? result.text
                              : snapshot.schedule;
                          })()}
                    </p>
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
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleRebuild}
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
                      onClick={() => handleCancelBuild(lastBuild._id)}
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
                    {baseImageReady ? (
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
                    ) : isRunning ? (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                        <Spinner size="sm" />
                        Building base Image…
                      </span>
                    ) : (
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
                    )}
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
                    {seededApps === undefined ? (
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    ) : isSeeding ? (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                        <Spinner size="sm" />
                        Capturing seeded snapshot…
                      </span>
                    ) : sharedSeededSnapshotName ? (
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
                    ) : !hasSeedableApps ? (
                      <p className="text-xs text-muted-foreground">
                        Not configured — no apps have Stop Commands. Sandboxes
                        use the base Image only, which is fine for most repos.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Not captured yet — run Rebuild Now after configuring app
                        startup/background/stop commands.
                      </p>
                    )}
                  </div>
                </div>
              </SettingsSection>
            </>
          ) : (
            <NoSnapshotConfigured />
          )}
        </>
      ) : null}

      {activeTab === "builds" ? (
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
                      <th className="px-2 py-2 font-medium sm:px-4">
                        Duration
                      </th>
                      <th className="px-2 py-2 font-medium sm:px-4">Trigger</th>
                      <th className="px-2 py-2 font-medium sm:px-4">
                        Provider
                      </th>
                      <th className="px-2 py-2 font-medium sm:px-4">Type</th>
                      <th className="px-2 py-2 font-medium sm:px-4">Status</th>
                      <th className="px-2 py-2 font-medium sm:px-4">Seeded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {builds.map((build) => {
                      const isExpanded = expandedBuild === build._id;
                      const duration = build.completedAt
                        ? formatDurationMs(build.completedAt - build.startedAt)
                        : build.status === "running"
                          ? "Running..."
                          : "-";
                      return (
                        <BuildRow
                          key={build._id}
                          build={build}
                          isExpanded={isExpanded}
                          duration={duration}
                          cancelling={cancelling}
                          onCancel={
                            build.status === "running"
                              ? () => handleCancelBuild(build._id)
                              : undefined
                          }
                          onToggle={() =>
                            setExpandedBuild(isExpanded ? null : build._id)
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
      ) : null}

      {activeTab === "config-files" ? (
        <ConfigFilesSection repoId={repoId} snapshotId={snapshot?._id} />
      ) : null}
        </m.div>
      </AnimatePresence>
    </SettingsPage>
  );
}

/**
 * Chunk size for splitting large file uploads. Convex enforces a 2-minute
 * server-side timeout on upload POSTs, so a 600MB single upload reliably stalls
 * once the server stops draining the TCP receive buffer. 100MB chunks finish
 * well within the timeout on broadband connections (~8s at 100Mbps, ~80s at
 * 10Mbps) and the snapshot/sandbox builder concatenates them back with `cat`.
 */
const UPLOAD_CHUNK_SIZE_BYTES = 100 * 1024 * 1024;

/** Extracts the storage ID from Convex's upload URL response body. */
function parseStorageIdResponse(text: string): Id<"_storage"> | null {
  try {
    const response = JSON.parse(text);
    return typeof response.storageId === "string" ? response.storageId : null;
  } catch {
    return null;
  }
}

/** Config files section for uploading files to be baked into snapshots. */
function ConfigFilesSection({
  repoId,
  snapshotId,
}: {
  repoId: Id<"githubRepos">;
  snapshotId?: Id<"repoSnapshots">;
}) {
  const files = useQuery(api.sandboxConfigFiles.list, { repoId });
  const generateUploadUrl = useMutation(
    api.sandboxConfigFiles.generateUploadUrl,
  );
  const saveFile = useMutation(api.sandboxConfigFiles.save);
  const removeFile = useMutation(api.sandboxConfigFiles.remove);
  const startBuild = useMutation(api.repoSnapshots.startBuild);

  const [uploading, setUploading] = useState(false);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const totalChunks = Math.max(
      1,
      Math.ceil(file.size / UPLOAD_CHUNK_SIZE_BYTES),
    );

    setUploading(true);
    setUploadedBytes(0);
    setTotalBytes(file.size);
    setChunkIndex(0);
    setChunkCount(totalChunks);
    setError(null);

    let uploadError: Error | undefined;
    // Built before the try: React Compiler bails on the whole file when a
    // logical expression sits inside a try/catch.
    const contentType = file.type || "application/octet-stream";
    // Upload each chunk: fresh upload URL per chunk, POST the slice, collect
    // storage IDs. Sequential keeps memory bounded and progress monotonic;
    // parallelism would only help for many small chunks, which isn't our case.
    //
    // Declared outside the try and called from inside it — errors still reach
    // the same catch — because React Compiler bails on the whole file when a
    // loop sits inside a try/catch. It reports failures via uploadError, same
    // as when the loop was inline.
    const uploadChunks = async () => {
      const ids: Id<"_storage">[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const start = i * UPLOAD_CHUNK_SIZE_BYTES;
        const end = Math.min(start + UPLOAD_CHUNK_SIZE_BYTES, file.size);
        const chunk = file.slice(start, end);
        setChunkIndex(i + 1);

        const uploadUrl = await generateUploadUrl({ repoId });
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: chunk,
        });
        const responseText = await result.text();
        if (!result.ok) {
          uploadError = new Error(
            `Upload failed at chunk ${i + 1}/${totalChunks} (status ${result.status}): ${responseText}`,
          );
          break;
        }
        const storageId = parseStorageIdResponse(responseText);
        if (!storageId) {
          uploadError = new Error(
            `Invalid response from storage at chunk ${i + 1}/${totalChunks}`,
          );
          break;
        }
        ids.push(storageId);
        setUploadedBytes(end);
      }
      return ids;
    };

    try {
      const chunkIds = await uploadChunks();

      if (!uploadError) {
        // Save file record with all chunk IDs in order
        await saveFile({
          repoId,
          chunks: chunkIds,
          fileName: file.name,
          fileSize: file.size,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      setUploading(false);
      setUploadedBytes(0);
      setTotalBytes(0);
      setChunkIndex(0);
      setChunkCount(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    if (uploadError) {
      setError(uploadError.message);
    }
    setUploading(false);
    setUploadedBytes(0);
    setTotalBytes(0);
    setChunkIndex(0);
    setChunkCount(0);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRebuild = async () => {
    if (!snapshotId) return;
    try {
      await startBuild({ repoSnapshotId: snapshotId, appRepoId: repoId });
    } catch {
      // Error shown via build status
    }
  };

  return (
    <div className="space-y-8">
      <RebuildRequiredWarning />

      <SettingsSection
        title={
          <>
            Sandbox Config Files{" "}
            <span className="font-normal text-muted-foreground">
              (optional — seeded snapshots only)
            </span>
          </>
        }
        description={
          <>
            Files uploaded here are copied into the codebase root when a sandbox
            starts. They are also available at{" "}
            <code>/home/eva/sandbox-config/</code> and{" "}
            <code>/tmp/sandbox-config/</code>. Only needed when app startup
            commands reference sensitive seeds (e.g. SQL dumps) that cannot live
            in git. Base Image rebuilds do not require any files here.
          </>
        }
        bodyClassName="space-y-4 px-4 py-4"
      >
        {error && (
          <div className="rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Upload button */}
        <div className="flex max-sm:flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
            id="config-file-upload"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Spinner size="sm" className="mr-1.5" />
                {totalBytes === 0
                  ? "Preparing..."
                  : `Chunk ${chunkIndex}/${chunkCount} • ${formatFileSize(uploadedBytes)} / ${formatFileSize(totalBytes)}`}
              </>
            ) : (
              <>
                <IconUpload size={14} className="mr-1.5" />
                Upload File
              </>
            )}
          </Button>
          {snapshotId && files && files.length > 0 && (
            <Button size="sm" onClick={handleRebuild}>
              <IconPlayerPlay size={14} className="mr-1.5" />
              Rebuild Snapshot
            </Button>
          )}
        </div>

        {/* Files table */}
        {files && files.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">File Name</th>
                  <th className="px-2 py-2 font-medium">Size</th>
                  <th className="px-2 py-2 font-medium">Uploaded</th>
                  <th className="px-2 py-2 font-medium w-10" />
                </tr>
              </thead>
              <tbody>
                {files.map((file, index) => (
                  <ListEnter
                    key={file._id}
                    as="tr"
                    index={index}
                    className="hover:bg-muted/30"
                  >
                    <td className="px-2 py-2 font-mono max-sm:break-all">
                      {file.fileName}
                    </td>
                    <td className="px-2 py-2">
                      {formatFileSize(file.fileSize)}
                    </td>
                    <td className="px-2 py-2">
                      {new Date(file.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void withMutationToast(
                            removeFile({ id: file._id }),
                            "File removed",
                            "Couldn't remove file",
                            "snapshot-config-file-delete",
                          )
                        }
                        aria-label={`Remove ${file.fileName}`}
                        className="max-sm:hit-target size-6 p-0"
                      >
                        <IconTrash size={14} />
                      </Button>
                    </td>
                  </ListEnter>
                ))}
              </tbody>
            </table>
          </div>
        ) : files && files.length === 0 ? (
          <SettingsEmptyState
            icon={IconFile}
            title="No config files yet"
            description="Upload files to include in snapshot builds."
          />
        ) : (
          <div className="flex items-center justify-center py-4">
            <Spinner size="sm" />
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
