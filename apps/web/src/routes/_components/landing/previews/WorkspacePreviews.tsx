import {
  IconGitPullRequest,
  IconLock,
  IconMessageCircle,
  IconShieldCheck,
} from "@tabler/icons-react";
import { cn } from "@eva/ui";
import {
  MockAvatar,
  MockChip,
  MockDot,
  MockLabel,
  MockWindow,
} from "./MockParts";

/** Weekly merge counts, as a share of the tallest bar. */
const WEEKLY_BARS = [
  { week: "W1", value: 38 },
  { week: "W2", value: 52 },
  { week: "W3", value: 44 },
  { week: "W4", value: 71 },
  { week: "W5", value: 63 },
  { week: "W6", value: 88 },
  { week: "W7", value: 76 },
  { week: "W8", value: 94 },
  { week: "W9", value: 82 },
  { week: "W10", value: 100 },
  { week: "W11", value: 91 },
  { week: "W12", value: 68 },
];

/**
 * Heatmap intensities, 0–4, written out rather than generated so the mock is
 * identical on every render and in every environment. One column per day, one
 * row per hour band, which is also where each cell's key comes from.
 */
type HeatLevel = 0 | 1 | 2 | 3 | 4;

const HEAT_BANDS = ["00", "04", "08", "12", "16", "20"];

const HEAT_COLUMNS: readonly { day: string; levels: readonly HeatLevel[] }[] = [
  { day: "d01", levels: [2, 0, 3, 4, 1, 0] },
  { day: "d02", levels: [0, 3, 2, 4, 4, 2] },
  { day: "d03", levels: [1, 0, 1, 3, 2, 2] },
  { day: "d04", levels: [4, 3, 0, 0, 1, 4] },
  { day: "d05", levels: [3, 1, 2, 0, 2, 3] },
  { day: "d06", levels: [4, 4, 2, 1, 0, 1] },
  { day: "d07", levels: [2, 3, 3, 4, 1, 0] },
  { day: "d08", levels: [0, 2, 4, 3, 2, 1] },
  { day: "d09", levels: [3, 4, 1, 0, 3, 2] },
  { day: "d10", levels: [1, 2, 2, 4, 4, 0] },
  { day: "d11", levels: [4, 1, 3, 2, 0, 3] },
  { day: "d12", levels: [2, 3, 0, 1, 4, 4] },
  { day: "d13", levels: [0, 1, 4, 3, 2, 1] },
  { day: "d14", levels: [3, 2, 2, 0, 1, 3] },
];

const HEAT_TONE: Record<HeatLevel, string> = {
  0: "bg-muted",
  1: "bg-primary/20",
  2: "bg-primary/40",
  3: "bg-primary/65",
  4: "bg-primary",
};

const LEADERBOARD = [
  { initials: "RK", name: "Riya", merged: 34 },
  { initials: "JM", name: "Jonas", merged: 27 },
  { initials: "AO", name: "Ada", merged: 19 },
];

/** Stats: what shipped, when, and who shipped it. */
export function StatsPreview() {
  return (
    <MockWindow
      title="acme/web · stats"
      trailing={<MockChip tone="success">+18% vs last month</MockChip>}
      bodyClassName="p-3.5"
    >
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-border bg-muted/25 p-2">
          <MockLabel>Merged</MockLabel>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
            127
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/25 p-2">
          <MockLabel>Sessions</MockLabel>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
            342
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/25 p-2">
          <MockLabel>Merge rate</MockLabel>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
            71%
          </p>
        </div>
      </div>

      <div className="mt-3 flex h-14 items-end gap-1.5">
        {WEEKLY_BARS.map((bar) => (
          <span
            key={bar.week}
            aria-hidden
            className="flex-1 rounded-t-[3px] bg-primary/70"
            style={{ height: `${bar.value}%` }}
          />
        ))}
      </div>

      <div className="mt-3 flex items-start gap-4">
        <div className="grid grid-flow-col grid-rows-6 gap-[3px]" aria-hidden>
          {HEAT_COLUMNS.map((column) =>
            HEAT_BANDS.map((band, row) => (
              <span
                key={`${column.day}-${band}`}
                className={cn(
                  "size-[9px] rounded-[2px]",
                  HEAT_TONE[column.levels[row] ?? 0],
                )}
              />
            )),
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          {LEADERBOARD.map((person) => (
            <div key={person.name} className="flex items-center gap-1.5">
              <MockAvatar initials={person.initials} tone="primary" />
              <span className="min-w-0 flex-1 truncate text-[10.5px] text-foreground">
                {person.name}
              </span>
              <span className="font-mono text-3xs tabular-nums text-muted-foreground">
                {person.merged}
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockWindow>
  );
}

const NOTIFICATIONS = [
  {
    icon: IconGitPullRequest,
    title: "#142 is ready for review",
    meta: "Fix checkout postcode validation · 4m ago",
    unread: true,
  },
  {
    icon: IconShieldCheck,
    title: "Task run finished with 1 failing check",
    meta: "acme/web · 22m ago",
    unread: true,
  },
  {
    icon: IconMessageCircle,
    title: "Agent asked a question",
    meta: "Session on acme/api · 1h ago",
    unread: false,
  },
];

/** Inbox: the small number of things that actually need a person. */
export function InboxPreview() {
  return (
    <MockWindow
      title="inbox"
      trailing={<MockChip tone="primary">2 unread</MockChip>}
      bodyClassName="p-3.5"
    >
      <div className="space-y-1.5">
        {NOTIFICATIONS.map((notification) => {
          const Icon = notification.icon;
          return (
            <div
              key={notification.title}
              className={cn(
                "flex items-start gap-2.5 rounded-md border px-2.5 py-2",
                notification.unread
                  ? "border-border bg-card"
                  : "border-transparent",
              )}
            >
              <Icon
                size={14}
                className="mt-0.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-medium text-foreground">
                  {notification.title}
                </p>
                <p className="truncate text-3xs text-muted-foreground">
                  {notification.meta}
                </p>
              </div>
              {notification.unread ? <MockDot tone="primary" /> : null}
            </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-1.5 rounded-md border border-border bg-muted/25 p-2.5">
        <MockLabel>Also delivered by email</MockLabel>
        <p className="text-[10.5px] text-muted-foreground">
          Daily digest · Weekly changelog · Both optional
        </p>
      </div>
    </MockWindow>
  );
}

const MEMBERS = [
  { initials: "RK", name: "Riya", role: "Owner", tone: "primary" as const },
  { initials: "JM", name: "Jonas", role: "Admin", tone: "review" as const },
  { initials: "AO", name: "Ada", role: "Member", tone: "neutral" as const },
];

const SECRETS = ["ANTHROPIC_API_KEY", "DATABASE_URL", "STRIPE_SECRET_KEY"];

/** Teams: who is in the workspace, and the secrets their sandboxes receive. */
export function TeamsPreview() {
  return (
    <MockWindow
      title="acme · team settings"
      trailing={<MockChip>3 members</MockChip>}
      bodyClassName="p-3.5"
    >
      <div className="space-y-1">
        {MEMBERS.map((member) => (
          <div
            key={member.name}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/30"
          >
            <MockAvatar initials={member.initials} tone={member.tone} />
            <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-foreground">
              {member.name}
            </p>
            <MockChip tone={member.tone}>{member.role}</MockChip>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-border bg-muted/25 p-2.5">
        <div className="flex items-center gap-1.5">
          <IconLock size={11} className="text-muted-foreground" aria-hidden />
          <MockLabel>Environment variables</MockLabel>
        </div>
        <div className="mt-2 space-y-1.5">
          {SECRETS.map((secret) => (
            <div key={secret} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-3xs text-foreground">
                {secret}
              </span>
              <span className="font-mono text-3xs text-muted-foreground">
                ••••••••
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-3xs text-muted-foreground">
          Encrypted at rest, decrypted only inside your sandboxes.
        </p>
      </div>
    </MockWindow>
  );
}
