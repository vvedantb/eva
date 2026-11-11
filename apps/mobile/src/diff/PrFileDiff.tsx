import { lineCommentTarget, lineRangeCommentTarget, unifiedDiffLines, type DiffFileEntry } from "@eva/shared";
import {
  IconAlertTriangle,
  IconArrowsVertical,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconExternalLink,
  IconMessage,
  IconTrash,
} from "@tabler/icons-react-native";
import { DiffStat, UnifiedDiff } from "@vvedantb/native-ui/ai";
import {
  Button,
  Checkbox,
  EmptyState,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetRow,
  SheetTitle,
  Spinner,
  Text,
  Textarea,
} from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BackHandler, Linking, Pressable, ScrollView, View, type TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MenuSheet } from "@/ui/MenuSheet";
import { textColor, useScheme } from "@/ui/theme";
import { usePendingLineComments, useViewedFiles, type PrDiffState, type PrRef } from "./prDiffStore";

type ReadyDiff = Extract<PrDiffState, { status: "ready" }>;

/**
 * Lines of one file drawn at a time. A diff line is three views and the diff
 * scrolls sideways as one block, so it is not a virtualised list; a longer
 * file shows this many more on each "Show more lines".
 */
const DIFF_LINE_CHUNK = 400;

/**
 * The web Code tab's states before there is a file to draw: loading, could
 * not load (Refresh diff is in the ⋯ menu, as on the web) and no net changes.
 * `children` gets the ready diff.
 */
export function PrDiffGate({
  state,
  children,
}: {
  state: PrDiffState;
  children: (diff: ReadyDiff) => ReactNode;
}) {
  const scheme = useScheme();
  const muted = textColor(scheme, "muted");
  if (state.status === "loading") {
    return (
      <View className="flex-1 flex-row items-center justify-center gap-2">
        <Spinner size="sm" decorative />
        <Text variant="muted" className="text-xs" style={muted}>
          Loading pull request diff…
        </Text>
      </View>
    );
  }
  if (state.status === "error") {
    return (
<EmptyState icon={IconAlertTriangle} title="Could not load the diff." />
    );
  }
  if (state.entries.length === 0) {
    return (
      <Text variant="muted" className="flex-1 px-6 pt-10 text-center text-xs" style={muted}>
        No net changes in this selection.
      </Text>
    );
  }
  return children(state);
}

/** The web note over a diff clipped at the size limit. */
export function TruncatedNote() {
  const scheme = useScheme();
  return (
    <Text
      variant="muted"
      className="mx-4 my-2 rounded-lg px-3 py-2 text-xs"
      style={[textColor(scheme, "muted"), { backgroundColor: tokens.color.surfaceSecondary[scheme] }]}
    >
      This diff exceeds the size limit. Changes shown are incomplete.
    </Text>
  );
}

/**
 * One changed file of a pull request, as the web Code tab's file card at phone
 * width: the file bar (the whole path, wrapping; its +/- counts; the pending
 * comment count; the ⋯ file menu as a sheet; the Viewed tick), then the
 * unified diff, drawn `DIFF_LINE_CHUNK` lines at a time, then a bar that steps
 * through the files in place (so Back leaves the diff, not one file). The chat
 * diff and the review Code tab both draw a file with this.
 *
 * With `commentable`, a tap on a line opens the web review comment box as a
 * sheet: the line's pending comments (each can be deleted) and a field to add
 * one. They wait in `usePendingLineComments` for the next review. The web
 * drags across lines for a range; here the sheet's "Select more lines" closes
 * it and a bar asks for the range's other end, which a tap on a second line
 * sets before the sheet opens again on the range, the draft kept (chose: two
 * taps, as a drag on a phone scrolls the diff). A range stays in one hunk, as
 * GitHub anchors it; Back or Cancel leaves the bar.
 */
export function PrFileDiff({
  pr,
  diff,
  path,
  onPathChange,
  commentable,
}: {
  pr: PrRef;
  diff: ReadyDiff;
  /** The file to show. One the PR does not touch (or none) opens the first, as the web list starts there. */
  path: string | undefined;
  onPathChange: (path: string) => void;
  commentable: boolean;
}) {
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const { isViewed, setViewed } = useViewedFiles(pr);
  const pending = usePendingLineComments(pr);
  const [shownLines, setShownLines] = useState<{ path: string; count: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** The rows the comment sheet is open on (`from` is the first tap); null while it is closed. */
  const [commentRange, setCommentRange] = useState<{ from: number; to: number } | null>(null);
  /** While set, the bar asks for the range's other end; the sheet is closed. */
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const muted = textColor(scheme, "muted");
  // Android back leaves the range bar first, as it closes a sheet first. An
  // effect because the hardware back button is a subscription outside React.
  useEffect(() => {
    if (rangeAnchor === null) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setRangeAnchor(null);
      return true;
    });
    return () => subscription.remove();
  }, [rangeAnchor]);

  const { entries } = diff;
  const index = Math.max(
    0,
    entries.findIndex((entry) => entry.path === path),
  );
  const entry = entries[index];
  if (entry === undefined) return null;
  const lines = entry.binary || !entry.hasHunks ? [] : unifiedDiffLines(entry.patch);
  const shown = shownLines?.path === entry.path ? shownLines.count : DIFF_LINE_CHUNK;
  const hidden = lines.length - shown;
  const fileComments = pending.comments.filter((comment) => comment.path === entry.path);
  const targets = lines.map(lineCommentTarget);
  // A comment shows under its last line, as the web draws it.
  const commentsAt = (row: number) => {
    const target = targets[row];
    return target ? fileComments.filter((comment) => comment.line === target.line && comment.side === target.side) : [];
  };
  const commentTarget = commentRange === null ? null : lineRangeCommentTarget(lines, commentRange.from, commentRange.to);
  const selection = rangeAnchor !== null ? { from: rangeAnchor, to: rangeAnchor } : commentRange;
  const marked = new Set(
    targets.flatMap((_, row) =>
      commentsAt(row).length > 0 ||
      (selection !== null && row >= Math.min(selection.from, selection.to) && row <= Math.max(selection.from, selection.to))
        ? [row]
        : [],
    ),
  );
  const pressLine = (row: number) => {
    if (rangeAnchor === null) {
      setCommentRange({ from: row, to: row });
      return;
    }
    if (lineRangeCommentTarget(lines, rangeAnchor, row) === null) {
      toast.error("A range stays inside one hunk");
      return;
    }
    setCommentRange({ from: rangeAnchor, to: row });
    setRangeAnchor(null);
  };
  const step = (by: number) => {
    const next = entries[index + by];
    if (!next) return;
    setRangeAnchor(null);
    onPathChange(next.path);
  };


  return (
    <View className="flex-1">
      {diff.truncated ? <TruncatedNote /> : null}
      {/* The web file bar: the whole path (wrapping), the counts, the menu and the tick. */}
      <View className="flex-row items-center gap-1 py-1 pr-1 pl-4" style={{ borderBottomWidth: 1, borderColor: tokens.color.border[scheme] }}>
        <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-x-3 gap-y-1 py-2">
          <FilePath entry={entry} />
          <PendingCommentCount count={fileComments.length} />
          {entry.binary ? null : <DiffStat additions={entry.additions} deletions={entry.deletions} hideZero />}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="File actions"
          onPress={() => setMenuOpen(true)}
          className="size-11 items-center justify-center rounded-full active:opacity-70"
        >
          <IconDots size={18} color={tokens.color.foreground[scheme]} />
        </Pressable>
        <View className="size-11 items-center justify-center">
          <Checkbox
            checked={isViewed(entry.path)}
            onCheckedChange={(viewed) => setViewed(entry.path, viewed)}
            accessibilityLabel={`Mark ${entry.path} as viewed`}
          />
        </View>
      </View>
      <ScrollView key={entry.path} className="flex-1">
        {entry.binary ? (
          <FileNote text="Binary file not shown." />
        ) : !entry.hasHunks ? (
          <FileNote text={entry.renamedFrom ? "File renamed without content changes." : "No content changes in this file."} />
        ) : (
          <>
            <UnifiedDiff
              lines={hidden > 0 ? lines.slice(0, shown) : lines}
              onLinePress={commentable ? pressLine : undefined}
              linePressHint={rangeAnchor === null ? "Comments on this line" : "Ends the range here"}
              markedLines={marked}
            />
            {hidden > 0 ? (
              <View className="items-center px-4 py-4">
                <Button
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  className="self-center"
                  onPress={() => setShownLines({ path: entry.path, count: shown + DIFF_LINE_CHUNK })}
                >
                  {`Show ${Math.min(hidden, DIFF_LINE_CHUNK).toLocaleString()} more lines`}
                </Button>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      {rangeAnchor === null ? null : (
        <View
          accessibilityLiveRegion="polite"
          className="flex-row items-center gap-2 pr-1 pl-4"
          style={{ borderTopWidth: 1, borderColor: tokens.color.border[scheme], backgroundColor: tokens.color.surfaceSecondary[scheme] }}
        >
          <IconArrowsVertical size={14} color={muted.color} />
          <Text className="min-w-0 flex-1 text-sm" style={textColor(scheme)}>
            {`Tap the other end of the range from ${targets[rangeAnchor]?.label ?? ""}`}
          </Text>
          {/* A 44 high target without slop, which would reach the step bar's buttons below. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => setRangeAnchor(null)}
            className="min-h-11 justify-center rounded-full px-3 active:opacity-70"
          >
            <Text className="text-sm" style={muted}>
              Cancel
            </Text>
          </Pressable>
        </View>
      )}
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
      <FileMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        path={entry.path}
        githubUrl={`${diff.repoUrl}/blob/${diff.headSha}/${entry.path}`}
      />
      {commentable ? (
        <LineCommentSheet
          target={commentTarget}
          comments={commentRange === null ? [] : commentsAt(Math.max(commentRange.from, commentRange.to))}
          onClose={() => setCommentRange(null)}
          onSelectRange={() => {
            if (commentRange === null) return;
            setRangeAnchor(commentRange.from);
            setCommentRange(null);
          }}
          onAdd={(target, body) => pending.add({ path: entry.path, ...target, body })}
          onRemove={pending.remove}
        />
      ) : null}
    </View>
  );
}

/** The web file bar's pending comment count (a message icon and the number); nothing at 0. */
export function PendingCommentCount({ count }: { count: number }) {
  const scheme = useScheme();
  const muted = textColor(scheme, "muted");
  if (count === 0) return null;
  return (
    <View className="flex-row items-center gap-1" accessible accessibilityLabel={`${count} pending ${count === 1 ? "comment" : "comments"}`}>
      <IconMessage size={14} color={muted.color} />
      <Text variant="muted" className="text-xs" style={muted}>
        {count}
      </Text>
    </View>
  );
}

/** A renamed file's old path struck through, then the path, breaking after a folder as the web `BreakablePath`'s `<wbr>`. */
export function FilePath({ entry, className = "min-w-0 shrink text-sm" }: { entry: DiffFileEntry; className?: string }) {
  const scheme = useScheme();
  const muted = textColor(scheme, "muted");
  return (
    <Text className={className} style={textColor(scheme)}>
      {entry.renamedFrom ? (
        <Text className="text-sm" style={[muted, { textDecorationLine: "line-through" }]}>
          {entry.renamedFrom.replaceAll("/", "/\u200B")}
        </Text>
      ) : null}
      {entry.renamedFrom ? <Text style={muted}>{" → "}</Text> : null}
      {entry.path.replaceAll("/", "/\u200B")}
    </Text>
  );
}

/**
 * The web file card's right-click menu, as a sheet: Copy path and View file on
 * GitHub. The web "Load full file context" needs a diff of two whole files,
 * which the phone does not draw, and "Open in Files" a sandbox file pane.
 */
function FileMenu({
  open,
  onOpenChange,
  path,
  githubUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  githubUrl: string;
}) {
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  return (
    <MenuSheet open={open} onOpenChange={onOpenChange} title={path.split("/").at(-1) ?? path}>
      <SheetRow
        icon={IconCopy}
        title="Copy path"
        onPress={() =>
          run(() =>
            void Clipboard.setStringAsync(path).then(
              () => toast.success("Path copied"),
              () => toast.error("Couldn't copy the path"),
            ),
          )
        }
      />
      <SheetRow icon={IconExternalLink} title="View file on GitHub" onPress={() => run(() => void Linking.openURL(githubUrl))} />
    </MenuSheet>
  );
}

type LineTarget = NonNullable<ReturnType<typeof lineRangeCommentTarget>>;

/**
 * The web review comment box (`DiffCommentDraftBox`, with the last line's
 * `DiffCommentPendingCard`s above it) as a sheet: open while `target` is set.
 * Closing drops the draft, as the web Cancel does, so it does not carry to
 * another line; "Select more lines" (`onSelectRange`) closes it and keeps the
 * draft for the range.
 */
function LineCommentSheet({
  target,
  comments,
  onClose,
  onSelectRange,
  onAdd,
  onRemove,
}: {
  target: LineTarget | null;
  comments: ReadonlyArray<{ id: string; body: string }>;
  onClose: () => void;
  onSelectRange: () => void;
  onAdd: (target: LineTarget, body: string) => void;
  onRemove: (id: string) => void;
}) {
  const scheme = useScheme();
  const muted = textColor(scheme, "muted");
  const [text, setText] = useState("");
  // The field, focused once the sheet is on screen (`onShow`): focus is imperative.
  const field = useRef<TextInput>(null);
  const trimmed = text.trim();
  const close = () => {
    setText("");
    onClose();
  };
  const submit = () => {
    if (target === null || trimmed.length === 0) return;
    onAdd(target, trimmed);
    close();
  };
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent className="gap-3 px-4" onShow={() => field.current?.focus()}>
        <SheetHeader>
          <SheetTitle>Review comment</SheetTitle>
          <SheetDescription>{`Comment on lines ${target?.label ?? ""}`}</SheetDescription>
        </SheetHeader>
        <SheetBody contentContainerClassName="gap-3">
          {comments.map((comment) => (
            <View
              key={comment.id}
              className="flex-row items-start gap-2 rounded-lg py-1 pl-3"
              style={{ borderWidth: 1, borderColor: tokens.color.border[scheme] }}
            >
              <Text className="min-w-0 flex-1 py-2 text-sm" style={textColor(scheme)}>
                {comment.body}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete comment"
                onPress={() => onRemove(comment.id)}
                className="size-11 items-center justify-center rounded-full active:opacity-70"
              >
                <IconTrash size={16} color={muted.color} />
              </Pressable>
            </View>
          ))}
          <Textarea
            ref={field}
            accessibilityLabel={`Comment on lines ${target?.label ?? ""}`}
            value={text}
            onChangeText={setText}
            placeholder="Request a change..."
          />
          <Button
            size="sm"
            variant="ghost"
            fullWidth={false}
            className="self-start"
            // 46 high, kept inside half the 12 gap to the field and the footer.
            hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
            leftIcon={<IconArrowsVertical size={14} color={muted.color} />}
            onPress={onSelectRange}
          >
            {target?.startLine === null ? "Select more lines" : "Change the range"}
          </Button>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onPress={close}>
            Cancel
          </Button>
          <Button disabled={trimmed.length === 0} onPress={submit}>
            Comment
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
