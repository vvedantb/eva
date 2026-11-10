import { api } from "@eva/backend";
import { buildDiffFileEntries, unifiedDiffLines, type DiffFileEntry } from "@eva/shared";
import { IconAlertTriangle, IconChevronLeft, IconChevronRight, IconGitPullRequest } from "@tabler/icons-react-native";
import { DiffStat, UnifiedDiff } from "@vvedantb/native-ui/ai";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { CenteredSpinner, EmptyState, Spinner, Text } from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { useAction, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { textColor, useScheme } from "@/ui/theme";

type PrDiff = { status: "ready"; entries: DiffFileEntry[]; truncated: boolean } | { status: "error" };

/**
 * The web Review pane's Code tab for one file, read-only: the chat's pull
 * request diff (`github.getPrDiff`, what is pushed to GitHub, so a sleeping
 * sandbox does not matter), opened at the file a "Changed files" row named,
 * or the first file. The header has the path and its +/- counts; the diff is
 * unified and scrolls sideways; the bar at the bottom steps through the files.
 * Before a PR is open, the web "No pull request yet" state.
 */
export default function DiffScreen() {
  const { target, file } = useLocalSearchParams<{ target: string; file?: string }>();
  const router = useRouter();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const chat = useQuery(api.mobile.getChat, { target });
  const getPrDiff = useAction(api.github.getPrDiff);
  const [loaded, setLoaded] = useState<{ prUrl: string; diff: PrDiff } | null>(null);
  const repoId = chat?.repoId;
  const prUrl = chat?.prUrl;

  // `getPrDiff` is an action, not a subscription, so it is read once per PR
  // when the screen opens (the server caches it for 2 minutes, as the web).
  useEffect(() => {
    if (repoId === undefined || prUrl === undefined) return;
    let live = true;
    getPrDiff({ repoId, prUrl })
      .then((payload) => {
        if (live) setLoaded({ prUrl, diff: { status: "ready", entries: buildDiffFileEntries(payload.diff), truncated: payload.truncated } });
      })
      .catch(() => {
        if (live) setLoaded({ prUrl, diff: { status: "error" } });
      });
    return () => {
      live = false;
    };
  }, [getPrDiff, repoId, prUrl]);

  const header = <StackPageHeader title="Diff" onBack={() => router.back()} />;
  const muted = textColor(scheme, "muted");

  if (chat === undefined) return <CenteredSpinner label="Loading chat" />;
  if (chat === null || prUrl === undefined) {
    return (
      <View className="flex-1">
        {header}
        {chat === null ? (
          <EmptyState icon={IconAlertTriangle} title="Chat not found" description="It was deleted, or you no longer have access." />
        ) : (
          <EmptyState
            icon={IconGitPullRequest}
            title="No pull request yet"
            description="Once a pull request is opened for this work, its diff will appear here."
          />
        )}
      </View>
    );
  }

  const diff = loaded?.prUrl === prUrl ? loaded.diff : null;
  if (diff === null || diff.status === "error" || diff.entries.length === 0) {
    return (
      <View className="flex-1">
        {header}
        {diff === null ? (
          <View className="flex-1 flex-row items-center justify-center gap-2">
            <Spinner size="sm" decorative />
            <Text variant="muted" className="text-xs" style={muted}>
              Loading pull request diff…
            </Text>
          </View>
        ) : diff.status === "error" ? (
          <EmptyState icon={IconAlertTriangle} title="Could not load the diff." />
        ) : (
          <Text variant="muted" className="flex-1 px-6 pt-10 text-center text-xs" style={muted}>
            No net changes in this selection.
          </Text>
        )}
      </View>
    );
  }

  const { entries } = diff;
  // A file the PR does not touch (or none) opens the first, as the web list starts there.
  const index = Math.max(0, entries.findIndex((entry) => entry.path === file));
  const entry = entries[index];
  if (entry === undefined) return null;
  const step = (by: number) => {
    const next = entries[index + by];
    if (next) router.setParams({ file: next.path });
  };

  return (
    <View className="flex-1">
      {header}
      {diff.truncated ? (
        <Text
          variant="muted"
          className="mx-4 mb-2 rounded-lg px-3 py-2 text-xs"
          style={[muted, { backgroundColor: tokens.color.surfaceSecondary[scheme] }]}
        >
          This diff exceeds the size limit. Changes shown are incomplete.
        </Text>
      ) : null}
      {/* The web file bar: the whole path (wrapping), then the counts. */}
      <View className="flex-row items-start gap-3 px-4 py-3" style={{ borderBottomWidth: 1, borderColor: tokens.color.border[scheme] }}>
        <Text className="min-w-0 flex-1 text-sm" style={textColor(scheme)}>
          {entry.renamedFrom ? (
            <Text className="text-sm" style={[muted, { textDecorationLine: "line-through" }]}>
              {entry.renamedFrom}
            </Text>
          ) : null}
          {entry.renamedFrom ? <Text style={muted}>{" → "}</Text> : null}
          {/* A long path breaks after a folder, as the web `BreakablePath`'s `<wbr>`. */}
          {entry.path.replaceAll("/", "/\u200B")}
        </Text>
        {entry.binary ? null : <DiffStat additions={entry.additions} deletions={entry.deletions} hideZero />}
      </View>
      <ScrollView key={entry.path} className="flex-1">
        {entry.binary ? (
          <FileNote text="Binary file not shown." />
        ) : !entry.hasHunks ? (
          <FileNote text={entry.renamedFrom ? "File renamed without content changes." : "No content changes in this file."} />
        ) : (
          <UnifiedDiff lines={unifiedDiffLines(entry.patch)} />
        )}
      </ScrollView>
      <View
        className="flex-row items-center justify-between px-2 pt-1"
        style={{ paddingBottom: Math.max(insets.bottom, 8), borderTopWidth: 1, borderColor: tokens.color.border[scheme] }}
      >
        <StepButton direction="previous" disabled={index === 0} onPress={() => step(-1)} />
        <Text variant="muted" className="text-xs" style={[muted, { fontVariant: ["tabular-nums"] }]}>
          {`${index + 1} of ${entries.length}`}
        </Text>
        <StepButton direction="next" disabled={index === entries.length - 1} onPress={() => step(1)} />
      </View>
    </View>
  );
}

/** The web body note for a file with nothing to draw (`px-3 py-4 text-xs`, muted). */
function FileNote({ text }: { text: string }) {
  const scheme = useScheme();
  return (
    <Text variant="muted" className="px-4 py-4 text-xs" style={textColor(scheme, "muted")}>
      {text}
    </Text>
  );
}

/** A 44 square step to the previous or next changed file. */
function StepButton({ direction, disabled, onPress }: { direction: "previous" | "next"; disabled: boolean; onPress: () => void }) {
  const scheme = useScheme();
  const Icon = direction === "previous" ? IconChevronLeft : IconChevronRight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === "previous" ? "Previous file" : "Next file"}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="size-11 items-center justify-center rounded-full"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Icon size={20} color={tokens.color.foreground[scheme]} />
    </Pressable>
  );
}
