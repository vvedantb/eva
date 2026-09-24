"use client";

import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  Badge,
  motionFast,
  Spinner,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { CountPop, countLabel } from "@/lib/components/ui/CountPop";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { IconFolder } from "@tabler/icons-react";
import type { Id } from "@eva/backend";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

interface BuildingProjectsBadgeProps {
  repoId: Id<"githubRepos">;
  basePath: string;
}

export function BuildingProjectsBadge({
  repoId,
  basePath,
}: BuildingProjectsBadgeProps) {
  const projects = useQuery(api.projects.getActive, { repoId });
  const buildingProjects =
    projects?.filter((p) => p.activeBuildWorkflowId !== undefined) ?? [];
  const sandboxProjects =
    projects?.filter(
      (p) =>
        p.reviewProjectSandboxStatus === "active" ||
        p.reviewProjectSandboxStatus === "starting",
    ) ?? [];

  const visible = buildingProjects.length > 0 || sandboxProjects.length > 0;

  const summaryParts: string[] = [];
  if (buildingProjects.length > 0)
    summaryParts.push(`${buildingProjects.length} building`);
  if (sandboxProjects.length > 0)
    summaryParts.push(`${sandboxProjects.length} active`);

  return (
    <AnimatePresence>
      {visible ? (
        <m.div
          key="building-projects"
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
                  label={countLabel(buildingProjects.length)}
                  className="flex items-center gap-1.5"
                >
                  <Spinner size="sm" className="size-[11px]" />
                  <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                    {buildingProjects.length}
                  </span>
                </CountPop>
                <CountPop
                  label={countLabel(sandboxProjects.length)}
                  className="flex items-center gap-1.5"
                >
                  <StatusDot />
                  <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                    {sandboxProjects.length}
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
                  <IconFolder size={15} className="text-primary" />
                  <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
                    Active projects
                  </h3>
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                    {summaryParts.map((part, i) => (
                      <span key={part} className="flex items-center gap-1.5">
                        {i > 0 && (
                          <span
                            aria-hidden
                            className="text-muted-foreground/40"
                          >
                            Â·
                          </span>
                        )}
                        <span>{part}</span>
                      </span>
                    ))}
                  </span>
                </div>

                <div className="space-y-3">
                  {buildingProjects.length > 0 && (
                    <Section
                      label="Building"
                      count={buildingProjects.length}
                      glyph={<Spinner size="sm" className="size-[11px]" />}
                    >
                      {buildingProjects.map((project) => (
                        <ProjectRow
                          key={project._id}
                          title={project.title}
                          to={toInternalRepoHref(
                            `${basePath}/projects/${entityPathSegment(project) ?? ""}`,
                          )}
                        />
                      ))}
                    </Section>
                  )}

                  {sandboxProjects.length > 0 && (
                    <Section
                      label="Sandbox"
                      count={sandboxProjects.length}
                      glyph={<StatusDot />}
                    >
                      {sandboxProjects.map((project) => (
                        <ProjectRow
                          key={project._id}
                          title={project.title}
                          to={toInternalRepoHref(
                            `${basePath}/projects/${entityPathSegment(project) ?? ""}`,
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

interface ProjectRowProps {
  title: string;
  to: string;
}

function ProjectRow({ title, to }: ProjectRowProps) {
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
      </div>
    </DynamicLink>
  );
}

function StatusDot() {
  return <span className="h-2 w-2 rounded-full bg-success" />;
}
