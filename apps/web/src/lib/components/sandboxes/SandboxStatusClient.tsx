"use client";

import dayjs from "dayjs";
import { useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "@eva/backend";
import { Spinner, SettingsToggleRow, SettingsSection } from "@vvedantb/ui";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";

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

function turnOffLabel(
  sandbox: AwakeSandbox,
  mode: AwakeSandboxes["mode"],
): string {
  if (mode === "off") return "Idle pause off";
  if (sandbox.busy) return "On while the agent works";
  if (sandbox.viewerName) return `On while ${sandbox.viewerName} views it`;
  return dayjs(sandbox.idleDeadline).isAfter(dayjs())
    ? `Pauses at ${formatClock(sandbox.idleDeadline)}`
    : "Pauses within 5 min";
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


  return (
    <SettingsPage title="Sandbox status">
      <SettingsSection
        title={`Awake sandboxes (${data.sandboxes.length})`}
        description={
          autoStop.enabled
            ? `Daily stop at ${autoStop.time} (${autoStop.timeZone})`
            : undefined
        }
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
