import { api } from "@eva/backend";
import { automationRunTone, automationWhenText, isAutomationRunActive } from "@eva/shared/automations";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { formatDuration } from "@eva/shared/duration";
import { IconChevronDown, IconChevronRight, IconGitPullRequest, IconPlayerPlay, IconPlayerStop, IconRobot } from "@tabler/icons-react-native";
import { RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { SettingsToggleRow } from "@vvedantb/native-ui/layout";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { Badge, Button, CenteredSpinner, EmptyState, Switch } from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOpenPr } from "@/reviews/PullRequestsSheet";
import { TimeAgo } from "@/ui/TimeAgo";
import { useScheme } from "@/ui/theme";

type Run = FunctionReturnType<typeof api.automations.listRuns>[number];

/**
 * One automation (the web automation page): when it runs, an On switch
 * (`automations.update`), Run now (`automations.runNow`), its prompt, and its
 * last 50 runs, newest first. A run row is its status, when it started and
 * how long it took; a tap opens its result (the report, the error, the pull
 * request it opened) and marks it read, as the web; a run in progress can be
 * stopped. Not here from the web: editing the prompt, schedule, trigger,
 * model and email settings, findings' actions, email drafts and the live
 * activity of a running run.
 */
export default function AutomationScreen() {
  const params = useLocalSearchParams<{ automationId: string; repo?: string }>();
  const insets = useSafeAreaInsets();
  const theme = EVA_THEME[useScheme()];
  // The automation resolves through the repo's list, so its id keeps its table type.
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === params.repo);
  const automations = useQuery(api.automations.list, repo ? { repoId: repo._id } : "skip");
  const automation = automations?.find((candidate) => candidate._id === params.automationId);
  const runs = useQuery(api.automations.listRuns, automation ? { automationId: automation._id } : "skip");
  const update = useMutation(api.automations.update);
  const runNow = useMutation(api.automations.runNow);
  const [starting, setStarting] = useState(false);

  const header = (
    <RouterStackPageHeader
      title={automation?.title ?? "Automation"}
      fallbackHref={{ pathname: "/projects", params: { section: "automations" } }}
    />
  );
  if (!automation) {
    const missing = repos !== undefined && (!repo || automations !== undefined);
    return (
      <View className="flex-1">
        {header}
        {missing ? (
          <EmptyState icon={IconRobot} title="Automation not found" description="It was deleted, or you no longer have access." />
        ) : (
          <CenteredSpinner label="Loading automation" />
        )}
      </View>
    );
  }

  const toggle = (enabled: boolean) => {
    update({ id: automation._id, enabled }).catch(() => toast.error("Couldn't update the automation"));
  };
  const start = () => {
    setStarting(true);
    // Chained, not try / finally, which React Compiler cannot compile.
    runNow({ automationId: automation._id })
      .then(() => toast.success("Run started"))
      .catch((cause: Error) => toast.error(cause.message || "Couldn't start the run"))
      .then(() => setStarting(false));
  };
  const active = runs?.some((run) => isAutomationRunActive(run.status)) ?? false;

  return (
    <View className="flex-1">
      {header}
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 24, gap: 16 }}>
        <Text className="font-instrument-sans text-sm" style={{ color: theme.mutedForeground }}>
          {automationWhenText(automation)}
        </Text>
        <View className="rounded-xl border" style={{ borderColor: theme.border, backgroundColor: theme.card }}>
          <SettingsToggleRow
            title="On"
            checked={automation.enabled}
            onCheckedChange={toggle}
            action={
              <Switch
                size="md"
                checked={automation.enabled}
                onCheckedChange={toggle}
                offColor={theme.muted}
                thumbStyle={{ backgroundColor: automation.enabled ? theme.primaryForeground : tokens.color.white }}
              />
            }
          />
        </View>
        <Button
          fullWidth={false}
          loading={starting}
          disabled={starting || active}
          leftIcon={<IconPlayerPlay size={16} color={theme.primaryForeground} />}
          onPress={start}
        >
          Run now
        </Button>
        <View className="gap-2">
          <Text accessibilityRole="header" className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
            Prompt
          </Text>
          <View className="rounded-xl border p-3" style={{ borderColor: theme.border, backgroundColor: theme.card }}>
            <Markdown>{automation.description}</Markdown>
          </View>
        </View>
        <View className="gap-2">
          <Text accessibilityRole="header" className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
            Runs
          </Text>
          {runs === undefined ? (
            <CenteredSpinner label="Loading runs" />
          ) : runs.length === 0 ? (
            <Text className="font-instrument-sans text-sm" style={{ color: theme.mutedForeground }}>
              No runs yet
            </Text>
          ) : (
            <View className="overflow-hidden rounded-xl border" style={{ borderColor: theme.border, backgroundColor: theme.card }}>
              {runs.map((run, index) => (
                <RunRow key={run._id} run={run} first={index === 0} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** The web `RunAccordion` row: status, start time and duration; open, the report, the error and the PR, with Stop while it runs. */
function RunRow({ run, first }: { run: Run; first: boolean }) {
  const theme = EVA_THEME[useScheme()];
  const acknowledge = useMutation(api.automations.acknowledgeRun);
  const cancel = useMutation(api.automations.cancelRun);
  const openPr = useOpenPr();
  const active = isAutomationRunActive(run.status);
  // The newest run starts open, as the web Latest tab; a running one too.
  const [open, setOpen] = useState(first || active);
  const Chevron = open ? IconChevronDown : IconChevronRight;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Opening a finished run reads it, as the web.
    if (next && !run.acknowledged && !active) acknowledge({ runId: run._id }).catch(() => undefined);
  };
  return (
    <View style={first ? undefined : { borderTopWidth: 1, borderColor: theme.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Run, ${run.status}`}
        onPress={toggle}
        className="min-h-12 flex-row items-center gap-2 px-3 py-2 active:opacity-70"
      >
        <Chevron size={14} color={theme.mutedForeground} />
        <Badge variant={automationRunTone(run.status)}>{run.status}</Badge>
        {!run.acknowledged && !active ? <View className="size-1.5 rounded-full" style={{ backgroundColor: theme.primary }} /> : null}
        <TimeAgo at={run.startedAt} className="font-instrument-sans min-w-0 flex-1 text-xs" style={{ color: theme.mutedForeground }} />
        {run.finishedAt ? (
          <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground, fontVariant: ["tabular-nums"] }}>
            {formatDuration(run.startedAt, run.finishedAt)}
          </Text>
        ) : null}
      </Pressable>
      {open ? (
        <View className="gap-3 px-3 pb-3">
          {run.resultSummary ? <Markdown>{run.resultSummary}</Markdown> : null}
          {run.error ? (
            <Text className="font-instrument-sans text-sm" style={{ color: theme.destructive }}>
              {run.error}
            </Text>
          ) : null}
          {!run.resultSummary && !run.error ? (
            <Text className="font-instrument-sans text-sm" style={{ color: theme.mutedForeground }}>
              {active ? "Running…" : "No report"}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {run.prUrl ? (
              <Button
                size="sm"
                fullWidth={false}
                variant="secondary"
                leftIcon={<IconGitPullRequest size={14} color={theme.secondaryForeground} />}
                onPress={() => run.prUrl && openPr(run.prUrl, run.repoId)}
              >
                Open PR
              </Button>
            ) : null}
            {active ? (
              <Button
                size="sm"
                fullWidth={false}
                variant="outline"
                leftIcon={<IconPlayerStop size={14} color={theme.foreground} />}
                onPress={() => cancel({ runId: run._id }).catch(() => toast.error("Couldn't stop the run"))}
              >
                Stop
              </Button>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
