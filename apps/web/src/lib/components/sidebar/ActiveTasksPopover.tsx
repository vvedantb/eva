"use client";

import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  Badge,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { CountPop, countLabel } from "@/lib/components/ui/CountPop";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { IconListCheck, IconLoader2 } from "@tabler/icons-react";
import type { Id } from "@eva/backend";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

interface ActiveTasksBadgeProps {
  repoId: Id<"githubRepos">;
  basePath: string;
}

export function ActiveTasksBadge({ repoId, basePath }: ActiveTasksBadgeProps) {
  const allTasks = useQuery(api.agentTasks.getActiveTasks, { repoId });
  const quickTasks = allTasks?.filter((t) => !t.projectId) ?? [];
  const runningTasks = quickTasks.filter((t) => t.status === "in_progress");
  const sandboxTasks = quickTasks.filter(
    (t) =>
      t.reviewTaskSandboxStatus === "active" ||
      t.reviewTaskSandboxStatus === "starting",
  );

  const visible = runningTasks.length > 0 || sandboxTasks.length > 0;

  return (
    <AnimatePresence>
      {visible ? (
        <m.div
          key="active-tasks"
          className="ml-auto"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={motionFast}
        >
          <HoverCard>
            <HoverCardTrigger asChild>
              <Badge
                variant="secondary"
                className="cursor-default items-center gap-2 border-none bg-sidebar-accent/50 px-1.5 py-0.5"
              >
                <CountPop
                  label={countLabel(runningTasks.length)}
                  className="flex items-center gap-1.5"
                >
                  <IconLoader2
                    size={11}
                    className="animate-spin text-muted-foreground"
                  />
                  <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                    {runningTasks.length}
                  </span>
                </CountPop>
                <CountPop
                  label={countLabel(sandboxTasks.length)}
                  className="flex items-center gap-1.5"
                >
                  <StatusDot />
                  <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                    {sandboxTasks.length}
                  </span>
                </CountPop>
              </Badge>
            </HoverCardTrigger>
            <HoverCardContent
              align="start"
              className="w-[min(22rem,calc(100vw-2rem))] p-3"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <IconListCheck size={15} className="text-primary" />
                  <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
                    Active tasks
                  </h3>
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                    {runningTasks.length > 0 && (
                      <span>{runningTasks.length} running</span>
                    )}
                    {runningTasks.length > 0 && sandboxTasks.length > 0 && (
                      <span aria-hidden className="text-muted-foreground/40">
                        Â·
                      </span>
                    )}
                    {sandboxTasks.length > 0 && (
                      <span>{sandboxTasks.length} active</span>
                    )}
                  </span>
                </div>

                <div className="space-y-3">
                  {runningTasks.length > 0 && (
                    <Section
                      label="Running"
                      count={runningTasks.length}
                      glyph={
                        <IconLoader2
                          size={11}
                          className="animate-spin text-muted-foreground"
                        />
                      }
                    >
                      {runningTasks.map((task) => (
                        <TaskRow
                          key={task._id}
                          title={task.title}
                          taskNumber={task.taskNumber}
                          to={toInternalRepoHref(
                            `${basePath}/quick-tasks/${entityPathSegment(task) ?? ""}`,
                          )}
                        />
                      ))}
                    </Section>
                  )}

                  {sandboxTasks.length > 0 && (
                    <Section
                      label="Sandbox"
                      count={sandboxTasks.length}
                      glyph={<StatusDot />}
                    >
                      {sandboxTasks.map((task) => (
                        <TaskRow
                          key={task._id}
                          title={task.title}
                          taskNumber={task.taskNumber}
                          to={toInternalRepoHref(
                            `${basePath}/quick-tasks/${entityPathSegment(task) ?? ""}`,
                          )}
                        />
                      ))}
                    </Section>
                  )}
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

interface SectionProps {
  label: string;
  count: number;
  glyph: React.ReactNode;
  children: React.ReactNode;
}

function Section({ label, count, glyph, children }: SectionProps) {
  return (
    <div className="rounded-surface bg-muted/40 p-1">
      <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <span className="flex h-3 w-3 items-center justify-center">
          {glyph}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/70 tabular-nums">
          {count}
        </span>
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

interface TaskRowProps {
  title: string;
  taskNumber?: number;
  to: string;
}

function TaskRow({ title, taskNumber, to }: TaskRowProps) {
  return (
    <DynamicLink
      to={to}
      className="block rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-[background-color,translate] hover:bg-background hover:translate-x-0.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-tight text-foreground">
            {title}
          </p>
        </div>
        {taskNumber && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/80 tabular-nums">
            #{taskNumber}
          </span>
        )}
      </div>
    </DynamicLink>
  );
}

function StatusDot() {
  return <span className="h-2 w-2 rounded-full bg-success" />;
}
