import {
  groupChangedFilesByRepo,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  shouldPreviewChangedFiles,
  type ChangedFile,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconChevronDown, IconFileText } from "@tabler/icons-react-native";
import { MONO_FONT } from "@vvedantb/native-ui/ai";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/** `text-sm` (14 / 20): every label here is tappable, so the phone floor, not the web `text-xs`. */
const LABEL = { fontSize: 14, lineHeight: 20 } as const;

/**
 * The header's 20-high fold and "View diff" reach 48: 20 up (the card's
 * `mt-2` and the reply above) and 8 down, to the row's edge, so they never
 * cover the file rows under them.
 */
const HEADER_SLOP = { top: 20, bottom: 8 };

/**
 * The web `ChangedFilesCard` under an agent reply: "Changed files (N)" with a
 * chevron that folds the list, "View diff" on the right, and a row per file
 * (icon and mono name; the web hides the folder below `sm`). The latest reply
 * opens with up to 5 files, or a 3-file preview and "Show all N files" above
 * that; older replies start folded. A row opens that file's diff; View diff
 * opens the first.
 */
export function ChangedFilesCard({
  files,
  isLatestAssistantTurn,
  onOpenDiff,
}: {
  files: ChangedFile[];
  isLatestAssistantTurn: boolean;
  /** Open the diff screen at a file (its sandbox path), or the first file. */
  onOpenDiff: (path: string | undefined) => void;
}) {
  const scheme = useScheme();
  // The reader's toggle; until then the web default for this turn.
  const [expanded, setExpanded] = useState<boolean | undefined>(undefined);
  if (files.length === 0) return null;

  const isExpanded = expanded ?? shouldAutoExpandChangedFiles(files, isLatestAssistantTurn);
  const shown = isExpanded
    ? files
    : shouldPreviewChangedFiles(files, isLatestAssistantTurn)
      ? selectChangedFilePreview(files)
      : [];
  const groups = groupChangedFilesByRepo(shown);
  const muted = EVA_THEME[scheme].mutedForeground;
  const foreground = EVA_THEME[scheme].foreground;

  return (
    // Web `Surface density="none"` with `mt-2`: the card fill at the 16 surface radius.
    <View className="mt-2 rounded-2xl" style={{ backgroundColor: EVA_THEME[scheme].card }}>
      <View className="flex-row items-center justify-between gap-2 px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          hitSlop={HEADER_SLOP}
          onPress={() => setExpanded(!isExpanded)}
          className="min-w-0 flex-row items-center gap-1.5"
        >
          <View style={{ transform: [{ rotate: isExpanded ? "0deg" : "-90deg" }] }}>
            <IconChevronDown size={14} color={muted} />
          </View>
          <Text className="font-instrument-sans-medium" style={[LABEL, { color: foreground, fontWeight: "500" }]}>
            {`Changed files (${files.length})`}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={{ ...HEADER_SLOP, left: 8, right: 8 }} onPress={() => onOpenDiff(files[0]?.path)}>
          <Text className="font-instrument-sans" style={[LABEL, { color: muted }]}>
            View diff
          </Text>
        </Pressable>
      </View>
      {shown.length > 0 ? (
        <View className="gap-0.5 px-1.5 pb-1.5">
          {groups.map((group) => (
            <View key={group.repoName ?? "-"} className="gap-0.5">
              {/* Multi-repo sessions: a heading per linked repo, as the web. */}
              {group.repoName && groups.length > 1 ? (
                <Text
                  className="px-1.5 pb-0.5 pt-1.5 font-instrument-sans-medium uppercase"
                  style={{ fontSize: 10, lineHeight: 14, letterSpacing: 0.25, color: withAlpha(muted, 0.7) }}
                >
                  {`${group.repoName}/`}
                </Text>
              ) : null}
              {group.files.map((file) => (
                <Pressable
                  key={file.path}
                  accessibilityRole="button"
                  accessibilityLabel={`${file.name}, view diff`}
                  onPress={() => onOpenDiff(file.path)}
                  // 44 high for touch; the web row is `px-1.5 py-1.5 rounded-md`.
                  className="min-h-11 flex-row items-center gap-2 rounded-md px-1.5"
                  style={({ pressed }) => (pressed ? { backgroundColor: EVA_THEME[scheme].muted } : null)}
                >
                  <IconFileText size={14} color={muted} />
                  <Text numberOfLines={1} className="min-w-0 shrink" style={[LABEL, { color: foreground, fontFamily: MONO_FONT }]}>
                    {file.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
          {!isExpanded && shown.length < files.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpanded(true)}
              className="min-h-11 justify-center rounded-md px-1.5"
              style={({ pressed }) => (pressed ? { backgroundColor: EVA_THEME[scheme].muted } : null)}
            >
              <Text className="font-instrument-sans" style={[LABEL, { color: muted }]}>
                {`Show all ${files.length} files`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
