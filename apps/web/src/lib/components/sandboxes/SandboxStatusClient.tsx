"use client";

import dayjs from "dayjs";
import { useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "@eva/backend";
import { Spinner } from "@eva/ui";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";

type AwakeSandboxes = FunctionReturnType<
  typeof api.sandboxIdlePause.listAwakeSandboxes
>;
type AwakeSandbox = AwakeSandboxes["sandboxes"][number];

const KIND_LABELS: Record<AwakeSandbox["kind"], string> = {
  session: "Session",
  task: "Quick task",
  project: "Project",
};

const SOURCE_LABELS: Record<
  NonNullable<AwakeSandbox["lastUserActivitySource"]>,
  string
> = {
  chat: "chat",
  start: "a sandbox start",
  viewing: "an open sandbox tab",
  "preview-tab": "the Preview tab",
  "preview-page": "the preview page",
  terminal: "the terminal",
  files: "the file browser",
  services: "a service start or stop",
};

/**
 * An absolute local time, not "3 minutes ago": the page only re-renders when
 * the data changes, so a relative time would go stale.
 */
function formatClock(at: number): string {
  const time = dayjs(at);
  return time.isSame(dayjs(), "day")
    ? time.format("HH:mm")
    : time.format("D MMM HH:mm");
}

function keptAwakeLine(sandbox: AwakeSandbox): string {
  const by = sandbox.lastUserName ? ` by ${sandbox.lastUserName}` : "";
  const via = sandbox.lastUserActivitySource
    ? ` via ${SOURCE_LABELS[sandbox.lastUserActivitySource]}`
    : "";
  return `Kept awake${by}${via} at ${formatClock(sandbox.lastUserActivityAt)}`;
}

/** When idle pause will stop this sandbox, or what holds it awake. */
function turnOffLabel(
  sandbox: AwakeSandbox,
  mode: AwakeSandboxes["mode"],
): string {
  if (mode === "off") return "Idle pause off";
  if (sandbox.busy) return "On while the agent works";
  if (sandbox.viewerName) return `On while ${sandbox.viewerName} views it`;
  const prefix = mode === "dry-run" ? "Would pause" : "Pauses";
  // The sweep runs every 5 minutes, so a passed deadline means the next tick.
  return dayjs(sandbox.idleDeadline).isAfter(dayjs())
    ? `${prefix} at ${formatClock(sandbox.idleDeadline)}`
    : `${prefix} within 5 min`;
}

/**
 * Every awake sandbox the user can see, who last kept it awake, and when it
 * will turn off. Replaces the old per-sandbox "Kept awake by" line.
 */
export function SandboxStatusClient() {
  const data = useQuery(api.sandboxIdlePause.listAwakeSandboxes);
  const autoStop = useQuery(api.sandboxAutoStop.getSandboxAutoStopSettings);

  if (data === undefined || autoStop === undefined) {
    return (
      <SettingsPage title="Sandbox status">
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </SettingsPage>
    );
  }

  const dailyStop = autoStop.enabled
    ? ` Daily auto-stop also stops all of them at ${autoStop.time} (${autoStop.timeZone}).`
    : "";

  return (
    <SettingsPage title="Sandbox status">
      <SettingsSection
        title={`Awake sandboxes (${data.sandboxes.length})`}
        description={`Sandboxes that run now, who kept each awake last, and when idle pause stops it.${dailyStop}`}
        bodyVariant="list"
      >
        {data.sandboxes.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No sandboxes are awake.
          </p>
        ) : (
          data.sandboxes.map((sandbox) => (
            <SettingsToggleRow
              key={sandbox.entityId}
              title={
                sandbox.href ? (
                  <Link to={sandbox.href} className="hover:underline">
                    {sandbox.title}
                  </Link>
                ) : (
                  sandbox.title
                )
              }
              description={
                <>
                  {`${sandbox.repoLabel} · ${KIND_LABELS[sandbox.kind]} · `}
                  <span data-pii>{keptAwakeLine(sandbox)}</span>
                </>
              }
              action={
                <span className="text-xs text-muted-foreground tabular-nums">
                  {turnOffLabel(sandbox, data.mode)}
                </span>
              }
            />
          ))
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
