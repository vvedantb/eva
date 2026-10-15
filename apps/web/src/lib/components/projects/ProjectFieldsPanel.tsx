"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, getAIModelProvider, normalizeAIModel } from "@eva/backend";
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
} from "@eva/ui";
import {
  IconUsers,
  IconUser,
  IconUserPlus,
  IconGitBranch,
  IconInfoCircle,
} from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import { FALLBACK_GIT_BASE_BRANCH, getUserInitials } from "@eva/shared";
import { UserInitials } from "@eva/shared/user-initials";
import { Facehash } from "facehash";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  FieldsSection,
  FIELD_ROW_CLASS,
  FIELD_TEXT_CLASS,
  FIELD_TRIGGER_CLASS,
} from "@/lib/components/fields/FieldsSection";
import { ProjectPhaseBadge } from "./ProjectPhaseBadge";
import { ProjectPhaseSelect } from "./_components/ProjectPhaseSelect";
import { ProjectDateRangeField } from "./_components/ProjectDateRangeField";
import { PriorityPicker } from "@/lib/components/priority/PriorityPicker";
import {
  useAvailableAiModels,
  useProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { ProjectTagsPopover } from "./_components/ProjectTagsPopover";
import { ModelSelectWithTraits } from "@/lib/components/ModelSelectWithTraits";
import { useUpdateProject } from "./useUpdateProject";
import { projectStoredTraits, useSetProjectTraits } from "./useProjectTraits";

/**
 * Project fields as a single column, one row per field — the Overview tab's
 * right-hand column. Mirrors the task Properties column (StatusFieldsSection).
 */
export function ProjectFieldsPanel({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const { repo } = useRepo();
  const project = useQuery(api.projects.get, { id: projectId });
  const users = useQuery(api.users.listAll);
  const currentUserId = useQuery(api.auth.me);
  const updateProject = useUpdateProject(projectId);
  const setProjectTraits = useSetProjectTraits(projectId);

  const displayName = (user: NonNullable<typeof users>[number]) =>
    user.fullName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    "Unnamed User";

  const currentModel = normalizeAIModel(project?.model);
  const { options: modelOptions } = useAvailableAiModels(
    project?.repoId,
    currentModel,
  );
  const { options: accounts, resolveId: resolveAccountId } =
    useProviderAccounts();

  if (!project) return null;

  const isOwner =
    currentUserId !== undefined && currentUserId === project.userId;
  const creator = (users ?? []).find((user) => user._id === project.userId);
  const ownerAccountLabel =
    creator?.firstName?.trim() || creator?.fullName?.trim() || "Personal";
  const displayAccounts =
    isOwner || !project.providerAccountId
      ? accounts
      : [
          {
            id: project.providerAccountId,
            provider: getAIModelProvider(currentModel),
            label: ownerAccountLabel,
            // The project owner's account, shown to a collaborator: theirs, not
            // the viewer's, so it must never be defaulted to.
            isOwn: false,
          },
          ...accounts,
        ];
  const displayBaseBranch =
    project.baseBranch ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const reviewers = (users ?? []).filter((u) => u.role === "dev");
  const reviewerUser = project.codeReviewer
    ? users?.find((u) => u._id === project.codeReviewer)
    : undefined;
  const lead = project.projectLead
    ? (users ?? []).find((u) => u._id === project.projectLead)
    : undefined;

  return (
    <div className="space-y-4">
      <FieldsSection title="Properties">
        {project.phase === "draft" || project.phase === "finalized" ? (
          <div className={FIELD_ROW_CLASS}>
            <ProjectPhaseBadge phase={project.phase} />
          </div>
        ) : (
          <ProjectPhaseSelect
            value={project.phase}
            onChange={(phase) => updateProject({ id: projectId, phase })}
          />
        )}

        <div className={FIELD_ROW_CLASS}>
          <PriorityPicker
            value={project.priority}
            onChange={(p) =>
              updateProject({ id: projectId, priority: p ?? null })
            }
            className={FIELD_TEXT_CLASS}
          />
        </div>

        <Select
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

        <Select
          value={project.codeReviewer ?? "none"}
          onValueChange={(val) =>
            updateProject({
              id: projectId,
              codeReviewer:
                val === "none"
                  ? null
                  : ((users ?? []).find((u) => u._id === val)?._id ?? null),
            })
          }
        >
          <SelectTrigger className={FIELD_TRIGGER_CLASS}>
            <SelectValue>
              <div
                className={`flex items-center gap-1.5 ${!project.codeReviewer ? "text-muted-foreground" : ""}`}
              >
                {reviewerUser ? (
                  <Facehash
                    size={16}
                    name={getUserInitials(reviewerUser)}
                    enableBlink
                  />
                ) : (
                  <IconUserPlus size={14} className="text-muted-foreground" />
                )}
                <span data-pii={Boolean(reviewerUser) || undefined}>
                  {reviewerUser ? displayName(reviewerUser) : "Code Reviewer"}
                </span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Code Reviewer</SelectLabel>
              <SelectItem value="none">Unassigned</SelectItem>
              {reviewers.map((user) => (
                <SelectItem key={user._id} value={user._id}>
                  <div className="flex items-center gap-1.5">
                    <Facehash
                      size={16}
                      name={getUserInitials(user)}
                      enableBlink
                    />
                    <span data-pii>{displayName(user)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
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

        <div className={FIELD_ROW_CLASS}>
          <ModelSelectWithTraits
            value={currentModel}
            options={modelOptions}
            onValueChange={(nextModel) =>
              updateProject({ id: projectId, model: nextModel })
            }
            accounts={displayAccounts}
            accountId={project.providerAccountId ?? null}
            onAccountChange={(nextAccountId) => {
              if (!isOwner) return;
              updateProject({
                id: projectId,
                providerAccountId: resolveAccountId(nextAccountId) ?? null,
              });
            }}
            traits={projectStoredTraits(project)}
            onTraitsChange={setProjectTraits}
            className={`px-0 ${FIELD_TEXT_CLASS}`}
          />
        </div>

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
        />
      </FieldsSection>

      <FieldsSection title="Labels">
        <ProjectTagsPopover
          tags={project.tags}
          onUpdate={(tags) => updateProject({ id: projectId, tags })}
          className={`${FIELD_ROW_CLASS} h-10 w-full`}
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
