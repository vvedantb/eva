import { getAIModelProvider, normalizeAIModel, type AIModel, type Id } from "@eva/backend";
import { mentionTokensToEditableText } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import type { ReactionGroup } from "@eva/shared/taskDetail";
import { PromptInput } from "@vvedantb/native-ui/ai";
import { Button } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View, type TextStyle } from "react-native";
import { ComposerMentionChips, UserMessageText } from "@/chat/MentionChip";
import { MentionMenu } from "@/chat/MentionMenu";
import { useMentionComposer } from "@/chat/useMentionComposer";
import { ReactionChips } from "@/quickTasks/TaskActivity";
import { EmojiPickerSheet, ReactableMenu, measureHeld, type HeldRect } from "@/quickTasks/TaskDiscussion";
import { displayTitle } from "@/ui/format";
import { useScheme } from "@/ui/theme";

// A task's title and prompt as the web edits them in place (`TaskHeader`,
// `TaskDescription`): the quick task screen and a project task's prompt card.

/** The web `TaskHeader` title: a tap edits it while editable; Return or leaving the field saves a changed, non-empty title. */
export function TaskTitle({
  title,
  editable,
  lockReason,
  onSave,
}: {
  title: string;
  editable: boolean;
  lockReason: string | undefined;
  onSave: (title: string) => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const [editing, setEditing] = useState<string | null>(null);
  const style: TextStyle = {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600",
    color: theme.foreground,
  };
  if (editing !== null) {
    const save = () => {
      const trimmed = editing.trim();
      if (trimmed && trimmed !== title) onSave(trimmed);
      setEditing(null);
    };
    return (
      <TextInput
        autoFocus
        accessibilityLabel="Task title"
        value={editing}
        onChangeText={setEditing}
        // Return blurs (`blurAndSubmit`), so leaving the field is the one save.
        onBlur={save}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        multiline
        className="font-instrument-sans-semibold rounded-lg px-2 py-1"
        style={{
          ...style,
          marginHorizontal: -8,
          backgroundColor: theme.secondary,
        }}
      />
    );
  }
  return (
    <Pressable
      accessibilityRole={editable ? "button" : "header"}
      accessibilityLabel={displayTitle(title)}
      accessibilityHint={editable ? "Edits the title" : lockReason}
      disabled={!editable}
      onPress={() => setEditing(title)}
      className="active:opacity-70"
    >
      <Text
        accessibilityRole="header"
        className="font-instrument-sans-semibold"
        style={style}
      >
        {displayTitle(title)}
      </Text>
    </Pressable>
  );
}

/**
 * The web `TaskDescription`: the Markdown with mention chips, or "No
 * description". While editable a tap opens the mention composer on it ("Add
 * description..." when empty); its send saves, Cancel leaves it as it was.
 * A long press opens the reactions (and Edit, Copy text), as the web hover.
 */
export function TaskDescription({
  description,
  repoId,
  model,
  editable,
  reactions,
  onSave,
}: {
  description: string | undefined;
  repoId: Id<"githubRepos">;
  /** The task chat's model (`useTaskChatModel`); its provider scopes the @-mentions. */
  model: AIModel | undefined;
  editable: boolean;
  reactions: { groups: ReactionGroup[]; toggle: (emoji: string) => void };
  onSave: (description: string) => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const composer = useMentionComposer(
    repoId,
    getAIModelProvider(normalizeAIModel(model)),
  );
  const [editing, setEditing] = useState(false);
  // Where the held description is on screen, while its hold menu is open.
  const [menuAnchor, setMenuAnchor] = useState<HeldRect | null>(null);
  const box = useRef<View>(null);
  const [pickingEmoji, setPickingEmoji] = useState(false);
  const text = description?.trim() ?? "";
  if (editing) {
    return (
      <View className="gap-2">
        <PromptInput
          value={composer.text}
          onChangeText={composer.setText}
          menu={
            composer.menu ? (
              <MentionMenu
                menu={composer.menu}
                onPick={composer.pick}
                onDismiss={composer.dismiss}
              />
            ) : null
          }
          header={
            composer.picks.length > 0 ? (
              <ComposerMentionChips
                picks={composer.picks}
                onRemove={composer.removePick}
              />
            ) : undefined
          }
          onSubmit={(next) => {
            const tokenized = composer.tokenize(next).trim();
            if (tokenized !== text) onSave(tokenized);
            setEditing(false);
          }}
          placeholder="Add description..."
          accessibilityLabel="Task description"
        />
        <View className="flex-row justify-end">
          <Button variant="ghost" size="sm" onPress={() => setEditing(false)}>
            Cancel
          </Button>
        </View>
      </View>
    );
  }
  const body = text ? (
    <UserMessageText content={text} />
  ) : (
    <Text
      className="font-instrument-sans text-sm"
      style={{ color: withAlpha(theme.mutedForeground, 0.6) }}
    >
      {editable ? "Add description..." : "No description"}
    </Text>
  );
  const startEditing = () => {
    composer.load(text);
    setEditing(true);
  };
  return (
    <>
      <Pressable
        accessibilityRole={editable ? "button" : undefined}
        accessibilityLabel={
          editable ? (text ? "Edit description" : "Add description") : undefined
        }
        accessibilityHint="Long press to react"
        onPress={editable ? startEditing : undefined}
        ref={box}
        onLongPress={() => measureHeld(box.current, setMenuAnchor)}
        className="rounded-lg active:opacity-70"
      >
        {body}
      </Pressable>
      {reactions.groups.length > 0 ? (
        <ReactionChips groups={reactions.groups} onToggle={reactions.toggle} />
      ) : null}
      <ReactableMenu
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        // The description, drawn again over the page.
        preview={<View style={{ backgroundColor: theme.background }}>{body}</View>}
        groups={reactions.groups}
        onToggleReaction={reactions.toggle}
        onMoreReactions={() => setPickingEmoji(true)}
        onEdit={editable ? startEditing : undefined}
        copyText={text ? mentionTokensToEditableText(text) : undefined}
      />
      <EmojiPickerSheet
        open={pickingEmoji}
        onOpenChange={setPickingEmoji}
        groups={reactions.groups}
        onPick={reactions.toggle}
      />
    </>
  );
}
