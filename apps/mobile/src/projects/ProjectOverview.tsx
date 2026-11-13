import { api, type Id } from "@eva/backend";
import {
  ACTIVE_PROJECT_PHASES,
  FALLBACK_GIT_BASE_BRANCH,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PROJECT_PHASE_LABELS,
  isProjectPlanning,
  type Priority,
  type ProjectPhase,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconCalendar, IconGitBranch, IconTag, IconUser, IconUserPlus, IconUsers } from "@tabler/icons-react-native";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { SheetRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import dayjs from "dayjs";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { FooterSheet } from "@/chat/ComposerFooter";
import { phaseAppearance } from "@/projects/phaseAppearance";
import { ProjectProgress } from "@/projects/ProjectProgress";
import { PriorityIcon } from "@/quickTasks/PriorityIcon";
import { userLabel } from "@/quickTasks/QuickTaskListOptions";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { useScheme } from "@/ui/theme";

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;
type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

/**
 * The web project Overview tab (`ProjectOverviewTab`) in one column: the
 * title, "Project context" (the description, as Markdown), the task
 * progress bar, then the web fields column (`ProjectFieldsPanel`):
 * Properties, Dates, Labels and Created. Phase (outside planning), Priority
 * and Project Lead open a bottom sheet each and write `projects.update`, as
 * the web selects; the rest read only here. Field rows are 48 high (web 40).
 * Not here from the web: editing the context, the code reviewer, members,
 * model, dates and labels pickers.
 */
export function ProjectOverview({ project, repo, users }: { project: Project; repo: Repo; users: User[] | undefined }) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const progress = useQuery(api.projects.getTaskProgress, { projectId: project._id });
  const currentUserId = useQuery(api.auth.me, {});
  const updateProject = useMutation(api.projects.update);
  const [sheet, setSheet] = useState<"phase" | "priority" | "lead" | null>(null);
  const update = (fields: Omit<Parameters<typeof updateProject>[0], "id">, failure: string) => {
    setSheet(null);
    updateProject({ id: project._id, ...fields }).catch(() => toast.error(failure));
  };
  const userById = (id: Id<"users"> | undefined) => (id ? users?.find((user) => user._id === id) : undefined);
  const lead = userById(project.projectLead);
  const reviewer = userById(project.codeReviewer);
  const creator = userById(project.userId);
  const phase = phaseAppearance(project.phase, scheme);
  const planning = isProjectPlanning(project.phase);
  const baseBranch = project.baseBranch ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const memberCount = project.members?.length ?? 0;
  const dateRange = [project.projectStartDate, project.projectEndDate]
    .map((date) => (date === undefined ? undefined : dayjs(date).format("MMM D, YYYY")))
    .filter(Boolean)
    .join(" – ");
  const muted = theme.mutedForeground;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}>
      <Text accessibilityRole="header" className="font-instrument-sans-semibold text-lg" style={{ fontWeight: "600", color: theme.foreground }}>
        {project.title}
      </Text>
      <View className="mt-4 gap-1">
        <Text className="font-instrument-sans-medium text-xs uppercase" style={{ color: muted, fontWeight: "500", letterSpacing: 0.6 }}>
          Project context
        </Text>
        {project.description ? (
          <Markdown>{project.description}</Markdown>
        ) : (
          <Text className="font-instrument-sans text-sm" style={{ color: muted }}>
            No project context yet.
          </Text>
        )}
      </View>
      {progress ? (
        <View className="mt-4">
          <ProjectProgress progress={progress} />
        </View>
      ) : null}

      <FieldGroup title="Properties">
        <FieldRow
          label="Phase"
          icon={<phase.icon size={16} color={phase.text} />}
          value={PROJECT_PHASE_LABELS[project.phase]}
          color={phase.text}
          onPress={planning ? undefined : () => setSheet("phase")}
        />
        <FieldRow
          label="Priority"
          icon={<PriorityIcon level={project.priority} />}
          value={project.priority ? PRIORITY_LABELS[project.priority] : "Priority"}
          color={project.priority ? undefined : muted}
          onPress={() => setSheet("priority")}
        />
        <FieldRow
          label="Project Lead"
          icon={<IconUser size={16} color={muted} />}
          value={lead ? (userLabel(lead) ?? "Unknown") : project.projectLead ? "Unknown" : "Project Lead"}
          color={project.projectLead ? undefined : muted}
          onPress={() => setSheet("lead")}
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
        <FieldRow label="Base branch for all tasks in this project" icon={<IconGitBranch size={16} color={muted} />} value={baseBranch} />
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

      {/* The web `ProjectPhaseSelect`: the phases a user can pick (planning drives Draft and Finalized). */}
      <FooterSheet open={sheet === "phase"} onOpenChange={(open) => setSheet(open ? "phase" : null)} title="Status">
        {ACTIVE_PROJECT_PHASES.map((option: ProjectPhase) => {
          const { icon: Icon, text } = phaseAppearance(option, scheme);
          return (
            <SheetRow
              key={option}
              leading={<Icon size={20} color={text} />}
              title={PROJECT_PHASE_LABELS[option]}
              active={project.phase === option}
              onPress={() => update({ phase: option }, "Couldn't change the phase")}
            />
          );
        })}
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
    </ScrollView>
  );
}

/** The web `FieldsSection`: a 14 medium muted title over its rows. */
function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <View className="mt-6 gap-0.5">
      <Text accessibilityRole="header" className="font-instrument-sans-medium px-2 pb-1 text-sm" style={{ color: muted, fontWeight: "500" }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** One field: its 16 icon and 14 value, 48 high. With `onPress` it is a button that opens the field's sheet. */
function FieldRow({
  label,
  icon,
  value,
  color,
  onPress,
}: {
  label: string;
  icon?: ReactNode;
  value: string;
  color?: string;
  onPress?: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const content = (
    <>
      {icon}
      <Text numberOfLines={1} className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: color ?? theme.foreground }}>
        {value}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${label}: ${value}`} className="min-h-12 flex-row items-center gap-1.5 rounded-lg px-2">
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      className="min-h-12 flex-row items-center gap-1.5 rounded-lg px-2 active:opacity-70"
    >
      {content}
    </Pressable>
  );
}
