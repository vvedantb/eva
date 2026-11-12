import { isProjectBuilding, type api, type Id } from "@eva/backend";
import { formatEntityNumLabel, PROJECT_PHASE_LABELS, type ProjectTaskProgress } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconListCheck, IconSparkles } from "@tabler/icons-react-native";
import { SurfaceRow } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSimpleView } from "@/chat/ComposerFooter";
import { phaseAppearance } from "@/projects/phaseAppearance";
import { ProjectProgress } from "@/projects/ProjectProgress";
import { META_TEXT, SANDBOX_DOT } from "@/quickTasks/QuickTaskRow";
import { displayTitle } from "@/ui/format";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { AwaitingAnswerMark } from "@/ui/RowStatus";
import { useScheme } from "@/ui/theme";

type Project = FunctionReturnType<typeof api.projects.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

/** Avatars drawn on a card; the rest are a "+N", as the web. */
const MAX_AVATARS = 3;

/** A project with no tasks yet, until `listTaskProgress` has its counts. */
const NO_PROGRESS: ProjectTaskProgress = {
  total: 0,
  todo: 0,
  in_progress: 0,
  business_review: 0,
  code_review: 0,
  done: 0,
  cancelled: 0,
};

/** The planning-mode badge: the web `Badge variant="secondary"` with its sparkles or checklist icon. */
export function PlanningModeBadge({ mode }: { mode: Project["planningMode"] }) {
  const theme = EVA_THEME[useScheme()];
  const Icon = mode === "interview" ? IconSparkles : IconListCheck;
  return (
    <View
      className="flex-row items-center gap-1 self-start rounded-full border px-2 py-0.5"
      style={{ backgroundColor: theme.secondary, borderColor: theme.border }}
    >
      <Icon size={12} color={theme.secondaryForeground} />
      <Text className="font-instrument-sans-medium" style={{ ...META_TEXT, fontWeight: "500", color: theme.secondaryForeground }}>
        {mode === "interview" ? "Interview" : "Tasks only"}
      </Text>
    </View>
  );
}

/**
 * One project, as the web `ProjectCard` in the list view at phone width: a
 * card with the phase stripe, then the number and title with the live mark
 * (the question mark, else the sandbox dot) and unread dot; the description
 * (else the raw input, in italics) on two lines; the task progress bar;
 * then the lead and members, and the planning-mode badge where the web
 * kebab sits. Sized for a thumb: a 14
 * title, 12 secondary text, `py-3`, 8 apart. A tap opens the project; a long
 * press opens the project menu (`onLongPress`), as the web kebab and
 * right-click. The web border beam on a building project is not drawn: the
 * phone has no beam, so the row says "Building" to a screen reader.
 */
export function ProjectRow({
  project,
  progress,
  users,
  onLongPress,
}: {
  project: Project;
  progress: ProjectTaskProgress | undefined;
  users: User[] | undefined;
  onLongPress: () => void;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const muted = theme.mutedForeground;
  const simpleView = useSimpleView();
  const appearance = phaseAppearance(project.phase, scheme);
  const numLabel = formatEntityNumLabel({ numId: project.numId });
  const preview = project.description ?? project.rawInput;
  const sandbox = project.sandboxStatus ? SANDBOX_DOT[project.sandboxStatus] : undefined;
  // The web `showsSandboxStatusDot`: simple view shows none.
  const showSandbox = sandbox !== undefined && !simpleView;
  const isBuilding = isProjectBuilding(project);
  const memberIds = [...new Set([project.projectLead, ...(project.members ?? [])].filter((id): id is Id<"users"> => id !== undefined))];
  const avatarIds = memberIds.length > 0 ? memberIds : [project.userId];
  const hiddenCount = avatarIds.length - MAX_AVATARS;
  const hint = [
    PROJECT_PHASE_LABELS[project.phase],
    isBuilding ? "Building" : undefined,
    project.isAwaitingAnswer ? "Eva asked you a question" : showSandbox ? sandbox.label : undefined,
    project.hasUnread ? "Unread" : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <SurfaceRow
      accessibilityLabel={displayTitle(project.title)}
      accessibilityHint={hint}
      accentColor={appearance.bar}
      backgroundColor={theme.card}
      // The web `px-3 py-2.5 pl-3.5` and `gap-1.5`; `py-3` for a thumb.
      className="min-h-[72px] gap-1.5 px-3 py-3 pl-3.5"
      onPress={() => router.push({ pathname: "/project/[projectId]", params: { projectId: project._id, repo: project.repoId } })}
      onLongPress={onLongPress}
      longPressLabel="Project actions"
    >
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1">
          <View className="min-w-0 flex-row items-baseline gap-1.5">
            {numLabel ? (
              <Text style={{ ...META_TEXT, fontFamily: "monospace", color: withAlpha(muted, 0.55), fontVariant: ["tabular-nums"] }}>
                {numLabel}
              </Text>
            ) : null}
            <Text
              numberOfLines={1}
              className="font-instrument-sans-medium min-w-0 flex-1 text-sm"
              style={{ fontWeight: "500", color: theme.foreground }}
            >
              {displayTitle(project.title)}
            </Text>
          </View>
          {preview ? (
            <Text
              numberOfLines={2}
              className="font-instrument-sans mt-1"
              style={{
                ...META_TEXT,
                lineHeight: 18,
                color: project.description ? muted : withAlpha(muted, 0.8),
                fontStyle: project.description ? "normal" : "italic",
              }}
            >
              {preview}
            </Text>
          ) : null}
        </View>
        <View className="shrink-0 flex-row items-center gap-1.5 pt-0.5">
          {project.isAwaitingAnswer ? (
            <AwaitingAnswerMark />
          ) : showSandbox ? (
            <View className="size-2 rounded-full" style={{ backgroundColor: sandbox.color ?? withAlpha(muted, 0.4) }} />
          ) : null}
          {project.hasUnread ? <View className="size-1.5 rounded-full" style={{ backgroundColor: theme.primary }} /> : null}
        </View>
      </View>

      <View className="mt-0.5 pt-0.5">
        <ProjectProgress progress={progress ?? NO_PROGRESS} thin />
        <View className="mt-2 flex-row items-center gap-1.5">
          <View className="flex-row">
            {avatarIds.slice(0, MAX_AVATARS).map((id, index) => (
              <View key={id} style={index > 0 ? { marginLeft: -2 } : undefined}>
                <InitialsAvatar user={users?.find((user) => user._id === id)} size={20} />
              </View>
            ))}
          </View>
          {hiddenCount > 0 ? (
            <Text className="font-instrument-sans-medium" style={{ ...META_TEXT, fontWeight: "500", color: muted, fontVariant: ["tabular-nums"] }}>
              {`+${hiddenCount}`}
            </Text>
          ) : null}
          {/* The planning badge ends the footer, where the web kebab sits (the long press is the menu), so a card is a line shorter. */}
          <View className="ml-auto">
            <PlanningModeBadge mode={project.planningMode} />
          </View>
        </View>
      </View>
    </SurfaceRow>
  );
}
