"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@vvedantb/ui";
import {
  IconUsers,
  IconUser,
  IconGitBranch,
  IconInfoCircle,
} from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { UserInitials } from "@eva/shared/user-initials";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  FieldsSection,
  FIELD_ROW_CLASS,
  FIELD_TEXT_CLASS,
  FIELD_TRIGGER_CLASS,
} from "@/lib/components/fields/FieldsSection";
import { ProjectStageBadge } from "./ProjectPhaseBadge";
import { useProjectTaskStatus } from "./useProjectStatus";
import { ProjectDateRangeField } from "./_components/ProjectDateRangeField";
import { PriorityPicker } from "@/lib/components/priority/PriorityPicker";
import { ProjectTagsPopover } from "./_components/ProjectTagsPopover";
import { useUpdateProject } from "./useUpdateProject";

/**
 * Project fields as a single column, one row per field — the Overview tab's
 * right-hand column. Mirrors the task Properties column (StatusFieldsSection).
 * An archived project's fields are disabled.
 */
export function ProjectFieldsPanel({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const { repo } = useRepo();
  const project = useQuery(api.projects.get, { id: projectId });
  const users = useQuery(api.users.listAll);
  const updateProject = useUpdateProject(projectId);
  const { status } = useProjectTaskStatus(projectId, repo._id);

  const displayName = (user: NonNullable<typeof users>[number]) =>
    user.fullName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    "Unnamed User";

  if (!project) return null;

  const readOnly = project.archivedAt !== undefined;
  const creator = (users ?? []).find((user) => user._id === project.userId);
  const displayBaseBranch =
    project.baseBranch ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const lead = project.projectLead
    ? (users ?? []).find((u) => u._id === project.projectLead)
    : undefined;

  return (
    <div className="space-y-4">
      <FieldsSection title="Properties">
        {/* Stage is derived from the child tasks. */}
        {status ? (
          <div className={FIELD_ROW_CLASS}>
            <ProjectStageBadge stage={status.stage} />
          </div>
        ) : null}

        <div className={FIELD_ROW_CLASS}>
          <PriorityPicker
            value={project.priority}
            onChange={(p) =>
              updateProject({ id: projectId, priority: p ?? null })
            }
            className={FIELD_TEXT_CLASS}
            disabled={readOnly}
          />
        </div>

        <Select
          disabled={readOnly}
          value={project.projectLead ?? "none"}
          onValueChange={(val) =>
            updateProject({
              id: projectId,
              projectLead:
                val === "none"
                  ? null
                  : ((users ?? []).find((u) => u._id === val)?._id ?? null),
            })
          }
        >
          <SelectTrigger className={FIELD_TRIGGER_CLASS}>
            <SelectValue>
              <div
                className={`flex items-center gap-1.5 ${!project.projectLead ? "text-muted-foreground" : ""}`}
              >
                <IconUser size={14} className="text-muted-foreground" />
                <span data-pii={Boolean(project.projectLead) || undefined}>
                  {lead
                    ? displayName(lead)
                    : project.projectLead
                      ? "Unknown"
                      : "Project Lead"}
                </span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Project Lead</SelectLabel>
              <SelectItem value="none">Unassigned</SelectItem>
              {(users ?? []).map((user) => (
                <SelectItem data-pii key={user._id} value={user._id}>
                  {displayName(user)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={readOnly}
              className={`${FIELD_ROW_CLASS} w-full gap-1.5 ${FIELD_TEXT_CLASS} ${!project.members?.length ? "text-muted-foreground" : ""}`}
            >
              <IconUsers size={14} className="text-muted-foreground shrink-0" />
              <span>
                {project.members?.length
                  ? `${project.members.length} member${project.members.length > 1 ? "s" : ""}`
                  : "Members"}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(() => {
              const memberIds = new Set(project.members ?? []);
              return (users ?? []).map((user) => {
                const isMember = memberIds.has(user._id);
                return (
                  <DropdownMenuCheckboxItem
                    data-pii
                    key={user._id}
                    checked={isMember}
                    onCheckedChange={() => {
                      const current = project.members ?? [];
                      const next = isMember
                        ? current.filter((id) => id !== user._id)
                        : [...current, user._id];
                      updateProject({ id: projectId, members: next });
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {displayName(user)}
                  </DropdownMenuCheckboxItem>
                );
              });
            })()}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* No model row: Eva and her tasks run on the model in Eva's chat composer. */}

        <div className={`${FIELD_ROW_CLASS} gap-1.5 ${FIELD_TEXT_CLASS}`}>
          <IconGitBranch size={14} className="text-muted-foreground" />
          <span>{displayBaseBranch}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconInfoCircle
                size={12}
                className="cursor-help text-muted-foreground"
              />
            </TooltipTrigger>
            <TooltipContent>
              Base branch for all tasks in this project
            </TooltipContent>
          </Tooltip>
        </div>
      </FieldsSection>

      <FieldsSection title="Dates">
        <ProjectDateRangeField
          start={project.projectStartDate}
          end={project.projectEndDate}
          onStartChange={(date) =>
            updateProject({
              id: projectId,
              projectStartDate: date ?? undefined,
            })
          }
          onEndChange={(date) =>
            updateProject({ id: projectId, projectEndDate: date ?? undefined })
          }
          disabled={readOnly}
        />
      </FieldsSection>

      <FieldsSection title="Labels">
        <ProjectTagsPopover
          tags={project.tags}
          onUpdate={(tags) => updateProject({ id: projectId, tags })}
          className={`${FIELD_ROW_CLASS} h-10 w-full`}
          disabled={readOnly}
        />
      </FieldsSection>

      <FieldsSection title="Created">
        <div
          className={`${FIELD_ROW_CLASS} gap-1.5 text-muted-foreground ${FIELD_TEXT_CLASS}`}
        >
          {creator ? (
            <>
              <UserInitials userId={creator._id} size="sm" />
              <span data-pii>{displayName(creator)}</span>
              <span>·</span>
            </>
          ) : null}
          <span>{dayjs(project._creationTime).format("DD/MM/YYYY HH:mm")}</span>
        </div>
      </FieldsSection>
    </div>
  );
}
