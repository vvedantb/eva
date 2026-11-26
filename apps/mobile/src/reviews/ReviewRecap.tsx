import {
  api,
  DEFAULT_AI_MODEL,
  INCOMPLETE_PR_RECAP_MESSAGE,
  hasStoredRecap,
  isIncompleteReadyRecap,
  normalizeAIModel,
  type AIModel,
  type RecapWalkthroughStep,
  type StoredModelTraits,
} from "@eva/backend";
import { storedRunTraits, toRunTraitArgs, unifiedDiffLines } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconAlertTriangle, IconChevronLeft, IconChevronRight, IconGitPullRequest, IconRefresh } from "@tabler/icons-react-native";
import { UnifiedDiff } from "@vvedantb/native-ui/ai";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { Button, Spinner, Tabs, TabsList, TabsTrigger } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ModelChip } from "@/chat/ModelChip";
import { usePrDiff, type PrDiffState, type PrRef } from "@/diff/prDiffStore";
import { TEXT_XS } from "@/reviews/ReviewSummary";
import { type Scheme, useScheme } from "@/ui/theme";

type RecapDoc = NonNullable<FunctionReturnType<typeof api.docs.getRecapByPrUrl>>;

/** Lines of one step file drawn at a time, as the Code tab's file screen. */
const STEP_LINE_CHUNK = 400;

/**
 * The web Summary "Recap" section body (`PrRecapPanel`) at phone width:
 * eva's walkthrough of the pull request (`docs.getRecapByPrUrl`), with the
 * web Recap / Summary switch, the failure and out-of-date banners, and the
 * model pick and Generate (or Regenerate) that start a run
 * (`docs.generatePrRecap`). The walkthrough steps through one step at a time
 * (title, summary, "Look closely", then each file's diff from the pull
 * request diff the Code tab reads). Not on the phone: the run's live activity
 * trail (a spinner line instead), "Ask agent" on a step, and the HTML page of
 * a recap stored before walkthroughs existed.
 */
export function ReviewRecap({
  pr,
  prUrl,
  recapDoc,
  defaultModel,
}: {
  pr: PrRef;
  prUrl: string;
  /** Undefined while the query loads; null when the pull request has no recap. */
  recapDoc: RecapDoc | null | undefined;
  defaultModel: string | undefined;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const generatePrRecap = useAction(api.docs.generatePrRecap);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"recap" | "summary">("recap");
  // Only the pending override is state; the last run's setup is read off the doc, as the web.
  const [pendingModel, setPendingModel] = useState<AIModel>();
  const [pendingTraits, setPendingTraits] = useState<StoredModelTraits>();
  const model = normalizeAIModel(pendingModel ?? recapDoc?.prRecapModel ?? defaultModel ?? DEFAULT_AI_MODEL);
  const traits = pendingTraits ?? storedRunTraits(recapDoc);

  const generate = () => {
    setGenerating(true);
    setError(null);
    generatePrRecap({ repoId: pr.repoId, prUrl, model, ...toRunTraitArgs(traits) }).then(
      () => setGenerating(false),
      (cause: Error) => {
        setGenerating(false);
        setError(cause.message || "Couldn't generate recap");
      },
    );
  };
  // Filled in the empty state, quiet in the toolbar, as the web.
  const controls = (label: string, disabled: boolean, variant: "primary" | "ghost") => (
    <View className="flex-row flex-wrap items-center gap-1">
      <ModelChip
        repoId={pr.repoId}
        model={model}
        traits={traits}
        onModelChange={setPendingModel}
        onTraitsChange={(partial) => setPendingTraits({ ...traits, ...partial })}
      />
      <Button
        size="sm"
        variant={variant}
        fullWidth={false}
        className="self-center"
        loading={generating}
        disabled={disabled || generating}
        leftIcon={<IconRefresh size={14} color={variant === "primary" ? theme.primaryForeground : theme.foreground} />}
        onPress={generate}
      >
        {label}
      </Button>
    </View>
  );
  const errorLine =
    error === null ? null : (
      <Text accessibilityRole="alert" className="text-sm" style={{ color: theme.destructive }}>
        {error}
      </Text>
    );

  if (recapDoc === undefined) {
    return (
      <View className="items-center py-6">
        <Spinner size="sm" accessibilityLabel="Loading recap" />
      </View>
    );
  }
  if (recapDoc === null) {
    return (
      <View className="items-center gap-2 rounded-lg px-4 py-6" style={{ backgroundColor: theme.card }}>
        <IconGitPullRequest size={40} color={withAlpha(theme.mutedForeground, 0.6)} />
        <Text className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
          No recap yet
        </Text>
        <Text className="text-center text-sm" style={{ color: theme.mutedForeground }}>
          Generate a recap of this pull request for reviewers.
        </Text>
        {errorLine}
        {controls(generating ? "Generating…" : "Generate recap", false, "primary")}
      </View>
    );
  }

  const pending = recapDoc.prRecapStatus === "pending";
  // Pending with no workflow behind it means the run died: show the failure and re-enable Generate.
  const stalled = pending && recapDoc.activeWorkflowId === undefined;
  const incomplete = isIncompleteReadyRecap(recapDoc);
  const failed = recapDoc.prRecapStatus === "error" || stalled || incomplete;

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(value: string) => setView(value === "summary" ? "summary" : "recap")}>
          <TabsList variant="segmented" size="sm" className="self-start">
            <TabsTrigger value="recap">Recap</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>
        </Tabs>
        {recapDoc.headSha === undefined ? null : (
          <Text style={[TEXT_XS, { color: theme.mutedForeground, fontFamily: "monospace" }]}>{recapDoc.headSha.slice(0, 7)}</Text>
        )}
      </View>
      {controls(hasStoredRecap(recapDoc) ? "Regenerate" : "Generate", pending && !stalled, "ghost")}
      {failed ? (
        <Banner tone="destructive" scheme={scheme} title={stalled ? "Recap stopped" : incomplete ? "Recap incomplete" : "Recap failed"}>
          {stalled
            ? "Generation stopped before it finished. Generate again to retry."
            : incomplete
              ? INCOMPLETE_PR_RECAP_MESSAGE
              : (recapDoc.prRecapError ?? "Something went wrong generating the recap.")}
        </Banner>
      ) : null}
      {pending && !stalled ? (
        <View className="flex-row items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: theme.card }}>
          <Spinner size="sm" decorative />
          <Text className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
            Generating recap...
          </Text>
        </View>
      ) : null}
      {errorLine}
      {view === "summary" ? (
        <View className="rounded-lg px-3 py-3" style={{ backgroundColor: theme.card }}>
          <Markdown>{recapDoc.content}</Markdown>
        </View>
      ) : (
        <RecapBody pr={pr} doc={recapDoc} stale={recapDoc.headSha !== undefined && hasStoredRecap(recapDoc) && !pending} scheme={scheme} />
      )}
    </View>
  );
}

/** The walkthrough, or why there is none; with the out-of-date banner when the branch moved on. */
function RecapBody({ pr, doc, stale, scheme }: { pr: PrRef; doc: RecapDoc; stale: boolean; scheme: Scheme }) {
  const steps = doc.recapWalkthrough ?? [];
  const theme = EVA_THEME[scheme];
  if (steps.length === 0) {
    return (
      <Text className="text-sm" style={{ color: theme.mutedForeground }}>
        {doc.html
          ? "This recap is an older page the phone does not draw. Open it on the web."
          : isIncompleteReadyRecap(doc) || doc.prRecapStatus === "error"
            ? INCOMPLETE_PR_RECAP_MESSAGE
            : "No recap yet. It is created the next time this review runs."}
      </Text>
    );
  }
  return <Walkthrough pr={pr} steps={steps} recapSha={stale ? (doc.headSha ?? null) : null} scheme={scheme} />;
}

/**
 * The web `RecapWalkthrough` at phone width: no step rail (the web hides it
 * below `md` too); the step's title, `n / total` and previous / next, its
 * summary, "Look closely", then the real diff of each file it covers.
 */
function Walkthrough({
  pr,
  steps,
  recapSha,
  scheme,
}: {
  pr: PrRef;
  steps: readonly RecapWalkthroughStep[];
  /** The commit the recap was written for, when it may be out of date. */
  recapSha: string | null;
  scheme: Scheme;
}) {
  const [index, setIndex] = useState(0);
  const { state } = usePrDiff(pr);
  const theme = EVA_THEME[scheme];
  // A regenerated recap can have fewer steps than the one being read.
  const current = Math.min(index, steps.length - 1);
  const step = steps[current];
  if (step === undefined) return null;
  return (
    <View className="gap-3">
      {recapSha !== null && state.status === "ready" && state.headSha !== recapSha ? (
        <Banner tone="warning" scheme={scheme} title="Recap is out of date">
          {`This recap is for ${recapSha.slice(0, 7)}. The pull request has new commits.`}
        </Banner>
      ) : null}
      <View className="flex-row items-center gap-1">
        <Text accessibilityRole="header" className="font-instrument-sans-semibold min-w-0 flex-1 text-base" style={{ color: theme.foreground, fontWeight: "600" }}>
          {step.title}
        </Text>
        <Text style={[TEXT_XS, { color: theme.mutedForeground, fontVariant: ["tabular-nums"] }]}>{`${current + 1} / ${steps.length}`}</Text>
        <StepButton label="Previous step" icon={IconChevronLeft} disabled={current === 0} onPress={() => setIndex(current - 1)} scheme={scheme} />
        <StepButton
          label="Next step"
          icon={IconChevronRight}
          disabled={current === steps.length - 1}
          onPress={() => setIndex(current + 1)}
          scheme={scheme}
        />
      </View>
      <Markdown>{step.summary}</Markdown>
      {step.lookClosely === undefined ? null : (
        <Banner tone="warning" scheme={scheme} title="Look closely">
          {step.lookClosely}
        </Banner>
      )}
      {step.files.map((path) => (
        <StepFile key={`${current}:${path}`} path={path} state={state} scheme={scheme} />
      ))}
    </View>
  );
}

/** One file of a step: its pull request diff, or why it cannot be shown (the web `StepFileDiff`). */
function StepFile({ path, state, scheme }: { path: string; state: PrDiffState; scheme: Scheme }) {
  const theme = EVA_THEME[scheme];
  const [shown, setShown] = useState(STEP_LINE_CHUNK);
  const note = (body: ReactNode) => (
    <View className="gap-1 rounded-lg px-3 py-2" style={{ backgroundColor: theme.card }}>
      <Text style={[TEXT_XS, { color: theme.foreground, fontFamily: "monospace" }]}>{path}</Text>
      {body}
    </View>
  );
  const muted = (text: string) => (
    <Text className="text-sm" style={{ color: theme.mutedForeground }}>
      {text}
    </Text>
  );
  if (state.status === "loading") return note(<Spinner size="sm" accessibilityLabel="Loading the diff" />);
  if (state.status === "error") return note(muted("Couldn't load the diff."));
  const entry = state.entries.find((candidate) => candidate.path === path);
  if (entry === undefined) return note(muted("Not in the current diff. It may be past the size limit, or a later commit removed the change."));
  if (entry.binary || !entry.hasHunks) return note(muted("No line changes to show."));
  const lines = unifiedDiffLines(entry.patch);
  const hidden = lines.length - shown;
  return (
    <View className="overflow-hidden rounded-lg" style={{ backgroundColor: theme.card }}>
      <Text className="px-3 py-2" style={[TEXT_XS, { color: theme.foreground, fontFamily: "monospace" }]}>
        {path}
      </Text>
      <UnifiedDiff lines={hidden > 0 ? lines.slice(0, shown) : lines} />
      {hidden > 0 ? (
        <View className="items-center p-3">
          <Button size="sm" variant="secondary" fullWidth={false} className="self-center" onPress={() => setShown(shown + STEP_LINE_CHUNK)}>
            {`Show ${Math.min(hidden, STEP_LINE_CHUNK).toLocaleString()} more lines`}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/** The web recap banners: the failure (destructive at 5%) and the warnings (out of date, Look closely). */
function Banner({ tone, scheme, title, children }: { tone: "destructive" | "warning"; scheme: Scheme; title: string; children: string }) {
  const color = EVA_THEME[scheme][tone];
  return (
    <View className="flex-row items-start gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: withAlpha(color, tone === "warning" ? 0.1 : 0.05) }}>
      <View className="pt-0.5">
        <IconAlertTriangle size={16} color={color} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-instrument-sans-medium text-sm" style={{ color, fontWeight: "500" }}>
          {title}
        </Text>
        <Text className="text-sm" style={{ color: withAlpha(color, 0.8) }}>
          {children}
        </Text>
      </View>
    </View>
  );
}

/** A 44 square step through the walkthrough. */
function StepButton({
  label,
  icon: Icon,
  disabled,
  onPress,
  scheme,
}: {
  label: string;
  icon: typeof IconChevronLeft;
  disabled: boolean;
  onPress: () => void;
  scheme: Scheme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="size-11 items-center justify-center rounded-full active:opacity-70"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Icon size={16} color={EVA_THEME[scheme].foreground} />
    </Pressable>
  );
}

export type { RecapDoc };
