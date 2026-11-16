import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconFileText, IconTrash } from "@tabler/icons-react-native";
import { Button } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FooterSheet } from "@/chat/ComposerFooter";
import { useScheme } from "@/ui/theme";

export type QuickTaskDraft = FunctionReturnType<typeof api.agentTasks.listDrafts>[number];

/**
 * The web quick-task `DraftsMenu`: "Drafts (N)", shown while the repo has
 * saved drafts, opens "Saved Drafts" as a bottom sheet, newest first. A row
 * loads its draft into the form and closes the sheet; its trash asks "Delete
 * draft?" in place of the row, as the web, then `agentTasks.remove` (a soft
 * delete). `onDeleted` lets the form forget a draft it had loaded.
 */
export function DraftsMenu({
  drafts,
  onLoad,
  onDeleted,
}: {
  drafts: QuickTaskDraft[] | undefined;
  onLoad: (draft: QuickTaskDraft) => void;
  onDeleted: (draftId: Id<"agentTasks">) => void;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const danger = EVA_THEME[scheme].destructive;
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<Id<"agentTasks"> | null>(null);
  const removeDraft = useMutation(api.agentTasks.remove);
  if (!drafts || drafts.length === 0) return null;

  const remove = async (draftId: Id<"agentTasks">) => {
    try {
      await removeDraft({ id: draftId });
    } catch {
      toast.error("Couldn't delete draft", { id: "draft-delete" });
      return;
    }
    toast.success("Draft deleted", { id: "draft-delete" });
    setConfirmId(null);
    onDeleted(draftId);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        fullWidth={false}
        className="self-center"
        leftIcon={<IconFileText size={16} color={theme.foreground} />}
        onPress={() => setOpen(true)}
      >
        {`Drafts (${drafts.length})`}
      </Button>
      <FooterSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConfirmId(null);
        }}
        title="Saved Drafts"
      >
        {drafts.map((draft) => {
          const name = draft.title || "Untitled";
          if (confirmId === draft._id) {
            return (
              <View
                key={draft._id}
                className="min-h-14 flex-row items-center justify-between gap-2 rounded-lg px-4"
                style={{ backgroundColor: withAlpha(danger, 0.05) }}
              >
                <Text numberOfLines={1} className="font-instrument-sans min-w-0 shrink text-sm" style={{ color: danger }}>
                  Delete draft?
                </Text>
                <View className="flex-row gap-1">
                  <Button variant="ghost" size="sm" fullWidth={false} onPress={() => setConfirmId(null)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" size="sm" fullWidth={false} onPress={() => void remove(draft._id)}>
                    Delete
                  </Button>
                </View>
              </View>
            );
          }
          return (
            <View key={draft._id} className="flex-row items-center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Load draft ${name}`}
                onPress={() => {
                  setOpen(false);
                  onLoad(draft);
                }}
                className="min-h-14 min-w-0 flex-1 justify-center rounded-lg px-4 active:opacity-70"
              >
                <Text
                  numberOfLines={1}
                  className="font-instrument-sans text-base"
                  style={draft.title ? { color: theme.foreground } : { color: theme.mutedForeground, fontStyle: "italic" }}
                >
                  {name}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete draft ${name}`}
                onPress={() => setConfirmId(draft._id)}
                className="h-11 w-11 items-center justify-center rounded-lg active:opacity-70"
              >
                <IconTrash size={16} color={theme.mutedForeground} />
              </Pressable>
            </View>
          );
        })}
      </FooterSheet>
    </>
  );
}
