import { api, getAIModelProvider, normalizeAIModel, type Id } from "@eva/backend";
import {
  FALLBACK_GIT_BASE_BRANCH,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PROJECT_PHASE_LABELS,
  isProjectPlanning,
  projectPickerAccounts,
  repoDisplayLabel,
  toPickerAccounts,
  type Priority,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import type { ProjectStatus } from "@eva/shared/projectStatus";
import { PROJECT_STAGE_LABELS } from "@eva/shared/projectView";
import { IconArrowUpRight, IconCalendar, IconFolders, IconGitBranch, IconTag, IconUser, IconUserPlus, IconUsers } from "@tabler/icons-react-native";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { SheetRow, Textarea } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import dayjs from "dayjs";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { FooterSheet, useSimpleView } from "@/chat/ComposerFooter";
import { ModelChip } from "@/chat/ModelChip";
import { phaseAppearance, projectStageAppearance } from "@/projects/phaseAppearance";
import { ProjectProgress, ProjectStageCounts } from "@/projects/ProjectProgress";
import { RepoAppMark } from "@/sessions/SessionGroup";
import { PriorityIcon } from "@/quickTasks/PriorityIcon";
import { userLabel } from "@/quickTasks/QuickTaskListOptions";
import { FieldGroup, FieldRow } from "@/ui/FieldRows";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { useScheme } from "@/ui/theme";

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;
type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

/**
 * The web project Overview tab (`ProjectOverviewTab`) in one column: the
 * title, "Project context" (the description, as Markdown; a tap edits it
 * and it saves when the field loses focus, as the web), the status block
 * (`ProjectSummarySection`: live stage counts and the progress bar from the
 * derived status, then the coordinator's summary document, which opens in
 * full), then the web fields column (`ProjectFieldsPanel`): Properties,
 * Repos (`ProjectCoordinatorFields`), Dates, Labels and
 * Created. Status is the derived stage (an older project still planning
 * shows its phase) and reads only. Priority and Project Lead open a bottom
 * sheet each and write `projects.update`, as the web selects; the model
 * chip (hidden in simple view, as the web) writes the model and, for the
 * project's owner, its account; Repos toggles extra repos in a sheet. Field
 * rows are 48 high (web 40). Not here from the web: the code reviewer,
 * members, dates and labels pickers.
 */
export function ProjectOverview({
  project,
  repo,
  users,
  status,
}: {
  project: Project;
  repo: Repo;
  users: User[] | undefined;
  /** The derived status (`useProjectTaskStatus`), undefined while the tasks load. */
  status: ProjectStatus | undefined;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const router = useRouter();
  const summaryDoc = useQuery(api.projects.getSummaryDoc, { projectId: project._id });
  const repos = useQuery(api.githubRepos.list, {});
  const currentUserId = useQuery(api.auth.me, {});
  const ownAccounts = useQuery(api.userProviderAccounts.listSelectable, {});
  const simpleView = useSimpleView();
  const updateProject = useMutation(api.projects.update);
  const setExtraRepoIds = useMutation(api.projects.setExtraRepoIds);
  const [editingContext, setEditingContext] = useState(false);
  const [sheet, setSheet] = useState<"priority" | "lead" | "repos" | null>(null);
  const openSheet = (next: "priority" | "lead" | "repos") => () => setSheet(next);
  const extraRepoIds = project.extraRepoIds ?? [];
  const repoChoices = (repos ?? []).filter((entry) => entry._id !== project.repoId);
  const extraRepos = repoChoices.filter((entry) => extraRepoIds.includes(entry._id));
  const saveContext = (value: string) => {
    setEditingContext(false);
    const description = value.trim();
    if (description === (project.description ?? "")) return;
    updateProject({ id: project._id, description }).catch(() => toast.error("Couldn't save project context"));
  };
  const toggleRepo = (repoId: Id<"githubRepos">) => {
    const next = extraRepoIds.includes(repoId) ? extraRepoIds.filter((id) => id !== repoId) : [...extraRepoIds, repoId];
    setExtraRepoIds({ projectId: project._id, repoIds: next }).catch(() => toast.error("Couldn't update repos"));
  };
  const update = (fields: Omit<Parameters<typeof updateProject>[0], "id">, failure: string) => {
    setSheet(null);
    updateProject({ id: project._id, ...fields }).catch(() => toast.error(failure));
  };
  const userById = (id: Id<"users"> | undefined) => (id ? users?.find((user) => user._id === id) : undefined);
  const lead = userById(project.projectLead);
  const reviewer = userById(project.codeReviewer);
  const creator = userById(project.userId);
  const model = normalizeAIModel(project.model);
  // As the web field: only the owner changes the account; anyone else sees the owner's.
  const isOwner = currentUserId !== undefined && currentUserId === project.userId;
  const accounts = projectPickerAccounts(toPickerAccounts(ownAccounts ?? []), {
    isOwner,
    providerAccountId: project.providerAccountId,
    provider: getAIModelProvider(model),
    ownerLabel: creator?.firstName?.trim() || creator?.fullName?.trim() || "Personal",
  });
  // The stage is derived from the child tasks; only an older project still planning shows its stored phase.
  const planning = isProjectPlanning(project.phase);
  const stage = planning
    ? { ...phaseAppearance(project.phase, scheme), label: PROJECT_PHASE_LABELS[project.phase] }
    : status
      ? { ...projectStageAppearance(status.stage, scheme), label: PROJECT_STAGE_LABELS[status.stage] }
      : undefined;
  const baseBranch = project.baseBranch ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const memberCount = project.members?.length ?? 0;
  const dateRange = [project.projectStartDate, project.projectEndDate]
    .map((date) => (date === undefined ? undefined : dayjs(date).format("MMM D, YYYY")))
    .filter(Boolean)
    .join(" – ");
  const muted = theme.mutedForeground;

  return (
    // The project context field scrolls into view 16 above the keyboard.
    <KeyboardAwareScrollView
      bottomOffset={16}
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
    >
      <Text accessibilityRole="header" className="font-instrument-sans-semibold text-lg" style={{ fontWeight: "600", color: theme.foreground }}>
        {project.title}
      </Text>
      <View className="mt-4 gap-1">
        <Text className="font-instrument-sans-medium text-xs uppercase" style={{ color: muted, fontWeight: "500", letterSpacing: 0.6 }}>
          Project context
        </Text>
        {editingContext ? (
          <Textarea
            // Uncontrolled so typing never fights the live query; saves when it loses focus, as the web.
            autoFocus
            defaultValue={project.description ?? ""}
            accessibilityLabel="Project context"
            onEndEditing={(event) => saveContext(event.nativeEvent.text)}
          />
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Edit project context" onPress={() => setEditingContext(true)} className="active:opacity-70">
            {project.description ? (
              <Markdown>{project.description}</Markdown>
            ) : (
              <Text className="font-instrument-sans text-sm" style={{ color: muted }}>
                No project context yet.
              </Text>
            )}
          </Pressable>
        )}
      </View>
      {status ? (
        <View className="mt-4 gap-3">
          <ProjectStageCounts status={status} />
          <ProjectProgress status={status} />
        </View>
      ) : null}
      {summaryDoc ? (
        <View className="mt-3 gap-2 rounded-xl p-4" style={{ backgroundColor: theme.card }}>
          <View className="flex-row items-center justify-between gap-3">
            <Text numberOfLines={1} className="font-instrument-sans-medium min-w-0 flex-1 text-sm" style={{ fontWeight: "500", color: theme.foreground }}>
              {summaryDoc.title}
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${summaryDoc.title}`}
              onPress={() => router.push({ pathname: "/doc/[docId]", params: { docId: summaryDoc._id, repo: repo._id } })}
              hitSlop={8}
              className="flex-row items-center gap-1 active:opacity-70"
            >
              <Text className="font-instrument-sans text-xs" style={{ color: muted }}>
                Open
              </Text>
              <IconArrowUpRight size={14} color={muted} />
            </Pressable>
          </View>
          <Markdown>{summaryDoc.content}</Markdown>
        </View>
      ) : null}

      <FieldGroup title="Properties">
        {stage ? (
          <FieldRow label="Status" icon={<stage.icon size={16} color={stage.text} />} value={stage.label} color={stage.text} />
        ) : null}
        <FieldRow
          label="Priority"
          icon={<PriorityIcon level={project.priority} />}
          value={project.priority ? PRIORITY_LABELS[project.priority] : "Priority"}
          color={project.priority ? undefined : muted}
          onPress={openSheet("priority")}
        />
        <FieldRow
          label="Project Lead"
          icon={<IconUser size={16} color={muted} />}
          value={lead ? (userLabel(lead) ?? "Unknown") : project.projectLead ? "Unknown" : "Project Lead"}
          color={project.projectLead ? undefined : muted}
          onPress={openSheet("lead")}
        />
        <FieldRow
          label="Code Reviewer"
          icon={reviewer ? <InitialsAvatar user={reviewer} size={16} /> : <IconUserPlus size={16} color={muted} />}
          value={reviewer ? (userLabel(reviewer) ?? "Unknown") : "Code Reviewer"}
          color={reviewer ? undefined : muted}
        />
        <FieldRow
          label="Members"
          icon={<IconUsers size={16} color={muted} />}
          value={memberCount > 0 ? `${memberCount} member${memberCount > 1 ? "s" : ""}` : "Members"}
          color={memberCount > 0 ? undefined : muted}
        />
        {simpleView ? null : (
          <View className="min-h-12 flex-row items-center">
            <ModelChip
              repoId={project.repoId}
              model={model}
              onModelChange={(next) => update({ model: next }, "Couldn't change the model")}
              account={{
                accounts,
                value: project.providerAccountId ?? null,
                onChange: (providerAccountId) => {
                  if (isOwner) update({ providerAccountId }, "Couldn't change the account");
                },
              }}
            />
          </View>
        )}
        <FieldRow label="Base branch for all tasks in this project" icon={<IconGitBranch size={16} color={muted} />} value={baseBranch} />
      </FieldGroup>
      <FieldGroup title="Repos">
        <FieldRow
          label="Extra repos"
          icon={<IconFolders size={16} color={muted} />}
          value={extraRepos.length > 0 ? extraRepos.map(repoDisplayLabel).join(", ") : "Extra repos"}
          color={extraRepos.length > 0 ? undefined : muted}
          onPress={openSheet("repos")}
        />
      </FieldGroup>
      <FieldGroup title="Dates">
        <FieldRow label="Dates" icon={<IconCalendar size={16} color={muted} />} value={dateRange || "No dates"} color={dateRange ? undefined : muted} />
      </FieldGroup>
      <FieldGroup title="Labels">
        <FieldRow
          label="Labels"
          icon={<IconTag size={16} color={muted} />}
          value={project.tags && project.tags.length > 0 ? project.tags.join(", ") : "No labels"}
          color={project.tags && project.tags.length > 0 ? undefined : muted}
        />
      </FieldGroup>
      <FieldGroup title="Created">
        <FieldRow
          label="Created"
          icon={creator ? <InitialsAvatar user={creator} size={16} /> : undefined}
          value={[creator ? userLabel(creator) : undefined, dayjs(project._creationTime).format("DD/MM/YYYY HH:mm")].filter(Boolean).join(" · ")}
          color={muted}
        />
      </FieldGroup>

      {/* The web Repos menu: every other repo the reader can access; a toggle writes at once and keeps the sheet open. */}
      <FooterSheet open={sheet === "repos"} onOpenChange={(open) => setSheet(open ? "repos" : null)} title="Repos">
        {repoChoices.map((choice) => (
          <SheetRow
            key={choice._id}
            leading={<RepoAppMark repo={choice} scheme={scheme} />}
            title={repoDisplayLabel(choice)}
            active={extraRepoIds.includes(choice._id)}
            multiple
            onPress={() => toggleRepo(choice._id)}
          />
        ))}
      </FooterSheet>
      {/* The web `PriorityPicker`. */}
      <FooterSheet open={sheet === "priority"} onOpenChange={(open) => setSheet(open ? "priority" : null)} title="Priority">
        <SheetRow
          leading={<PriorityIcon level={undefined} size={20} />}
          title="No priority"
          active={project.priority === undefined}
          onPress={() => update({ priority: null }, "Couldn't change the priority")}
        />
        {PRIORITY_ORDER.map((option: Priority) => (
          <SheetRow
            key={option}
            leading={<PriorityIcon level={option} size={20} />}
            title={PRIORITY_LABELS[option]}
            active={project.priority === option}
            onPress={() => update({ priority: option }, "Couldn't change the priority")}
          />
        ))}
      </FooterSheet>
      {/* The web Project Lead select: Unassigned, then every teammate. */}
      <FooterSheet open={sheet === "lead"} onOpenChange={(open) => setSheet(open ? "lead" : null)} title="Project Lead">
        <SheetRow title="Unassigned" active={project.projectLead === undefined} onPress={() => update({ projectLead: null }, "Couldn't set the lead")} />
        {(users ?? []).map((user) => (
          <SheetRow
            key={user._id}
            leading={<InitialsAvatar user={user} size={20} />}
            title={`${userLabel(user) ?? "Unknown"}${user._id === currentUserId ? " (you)" : ""}`}
            active={project.projectLead === user._id}
            onPress={() => update({ projectLead: user._id }, "Couldn't set the lead")}
          />
        ))}
      </FooterSheet>
    </KeyboardAwareScrollView>
  );
}
