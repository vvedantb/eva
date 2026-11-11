import type { DiffFileEntry, DiffFileStatus } from "@eva/shared";
import { DiffStat } from "@vvedantb/native-ui/ai";
import { Badge, Checkbox, ListDivider, SkeletonList, SkeletonRow, Text } from "@vvedantb/native-ui/primitives";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PendingCommentCount, PrDiffGate, TruncatedNote } from "@/diff/PrFileDiff";
import { usePendingLineComments, useViewedFiles, type PrDiffState, type PrRef } from "@/diff/prDiffStore";
import { textColor, useScheme } from "@/ui/theme";

/** The web `FileStatusChip`: a lifecycle chip, none for an ordinary modified file. */
const STATUS_CHIP: Record<DiffFileStatus, { label: string; variant: "success" | "destructive" | "secondary" } | null> = {
  added: { label: "Added", variant: "success" },
  deleted: { label: "Deleted", variant: "destructive" },
  renamed: { label: "Renamed", variant: "secondary" },
  modified: null,
};

/**
 * The review Code tab at phone width: the web file tree as one list, a row per
 * changed file (its name over its folder, the status chip, pending comments,
 * +/- counts and the Viewed tick). A tap opens the file's diff on its own
 * screen, so Back returns here. The diff options sit in the tab row, as the
 * web puts Code's controls there.
 */
export function ReviewCode({ pr, state, onOpenFile }: { pr: PrRef; state: PrDiffState; onOpenFile: (path: string) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <PrDiffGate
      state={state}
      // Rows shaped as `FileRow`: the name over its folder, the counts.
      loading={
        <SkeletonList
          label="Loading pull request diff"
          count={8}
          renderRow={(row) => <SkeletonRow index={row} lines={2} minHeight={56} />}
        />
      }
    >
      {(diff) => (
        <FlatList
          data={diff.entries}
          keyExtractor={(entry) => entry.path}
          ListHeaderComponent={diff.truncated ? <TruncatedNote /> : null}
          ItemSeparatorComponent={ListDivider}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          renderItem={({ item }) => <FileRow pr={pr} entry={item} onOpen={() => onOpenFile(item.path)} />}
        />
      )}
    </PrDiffGate>
  );
}

function FileRow({ pr, entry, onOpen }: { pr: PrRef; entry: DiffFileEntry; onOpen: () => void }) {
  const scheme = useScheme();
  const muted = textColor(scheme, "muted");
  const { isViewed, setViewed } = useViewedFiles(pr);
  const comments = usePendingLineComments(pr).comments.filter((comment) => comment.path === entry.path).length;
  const slash = entry.path.lastIndexOf("/");
  const chip = STATUS_CHIP[entry.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={entry.path}
      accessibilityHint="Opens the file's diff"
      onPress={onOpen}
      className="min-h-14 flex-row items-center gap-2 py-1 pr-1 pl-4 active:opacity-70"
    >
      <View className="min-w-0 flex-1 gap-0.5 py-2">
        <Text numberOfLines={1} className="text-sm" style={textColor(scheme)}>
          {entry.path.slice(slash + 1)}
        </Text>
        {slash > 0 ? (
          <Text numberOfLines={1} variant="muted" className="text-xs" style={muted}>
            {entry.path.slice(0, slash)}
          </Text>
        ) : null}
      </View>
      {/* `self-center`: the badge's own `self-start` would lift it to the row's top. */}
      {chip === null ? null : (
        <Badge variant={chip.variant} className="self-center" textClassName="text-xs">
          {chip.label}
        </Badge>
      )}
      <PendingCommentCount count={comments} />
      {entry.binary ? null : <DiffStat additions={entry.additions} deletions={entry.deletions} hideZero />}
      <View className="size-11 items-center justify-center">
        <Checkbox
          checked={isViewed(entry.path)}
          onCheckedChange={(viewed) => setViewed(entry.path, viewed)}
          accessibilityLabel={`Mark ${entry.path} as viewed`}
        />
      </View>
    </Pressable>
  );
}
