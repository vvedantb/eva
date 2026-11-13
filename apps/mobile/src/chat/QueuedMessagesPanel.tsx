import { api, type Id } from "@eva/backend";
import { moveQueuedId, orderQueuedRows, QUEUE_PANEL_LABEL, queuedMessagePreview, queuePanelLabel } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconArrowBarToUp,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconPencil,
  IconSteeringWheel,
  IconTrash,
} from "@tabler/icons-react-native";
import {
  Button,
  ConfirmDialog,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetRow,
  SheetTitle,
  Textarea,
} from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { impactHaptic } from "@vvedantb/native-ui/haptics";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, type TextInput } from "react-native";
import { ModelIcon } from "@/chat/MessageFooter";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { MenuSheet } from "@/ui/MenuSheet";
import { useScheme } from "@/ui/theme";

type QueuedRow = FunctionReturnType<typeof api.queuedMessages.listByParent>[number];

/** One row: 56 high, as a phone list row (the web row is a 24 high desktop line). */
const ROW_HEIGHT = 56;
/** Three rows show before the list scrolls, as the web list's `max-h-48`, so the transcript keeps most of the screen. */
const VISIBLE_ROWS = 3;

/**
 * The web `QueuedMessagesPanel` above the composer: the messages sent while
 * Eva works, waiting to run after the current turn, in run order, on the
 * web's own `queuedMessages` functions. The heading folds the list and says
 * why the queue waits ("Queued · sends when Eva wakes up"). A row shows its
 * author, its model and two lines of its text, with the web's Steer beside
 * it. The web's hover actions (Edit, Move to front, Delete) and its drag
 * reorder are a sheet here, opened by a tap or a long press: Edit, Move to
 * front, Move up, Move down and Delete. It is the only part that reads the
 * queue, and the chat screen hands it to the dock as one element, so typing
 * in the composer does not redraw it.
 */
export function QueuedMessagesPanel({
  parentId,
  isExecuting,
  isSandboxActive,
}: {
  /** The session chat (`getChat`'s `parentId`); undefined before a task's or project's chat exists. */
  parentId: Id<"sessionChats"> | undefined;
  isExecuting: boolean;
  isSandboxActive: boolean;
}) {
  const theme = EVA_THEME[useScheme()];
  const rows = useQuery(api.queuedMessages.listByParent, parentId ? { parentId } : "skip");
  const authorIds = [...new Set((rows ?? []).map((row) => row.userId))];
  const authors = useQuery(api.users.getMany, authorIds.length > 0 ? { ids: authorIds } : "skip");
  const [open, setOpen] = useState(true);
  const [menuFor, setMenuFor] = useState<Id<"queuedMessages"> | null>(null);
  const [editing, setEditing] = useState<QueuedRow | null>(null);
  const [deleting, setDeleting] = useState<QueuedRow | null>(null);

  // The web `useQueuedMessageMutations`: each change shows at once and rolls back if the server refuses it.
  const patchQueue = (store: OptimisticLocalStore, change: (current: QueuedRow[]) => QueuedRow[]) => {
    if (!parentId) return;
    const current = store.getQuery(api.queuedMessages.listByParent, { parentId });
    if (current !== undefined) store.setQuery(api.queuedMessages.listByParent, { parentId }, change(current));
  };
  const update = useMutation(api.queuedMessages.update).withOptimisticUpdate((store, args) =>
    patchQueue(store, (current) => current.map((row) => (row._id === args.id ? { ...row, content: args.content } : row))),
  );
  const remove = useMutation(api.queuedMessages.remove).withOptimisticUpdate((store, args) =>
    patchQueue(store, (current) => current.filter((row) => row._id !== args.id)),
  );
  const reorder = useMutation(api.queuedMessages.reorder).withOptimisticUpdate((store, args) =>
    patchQueue(store, (current) => orderQueuedRows(current, args.orderedIds)),
  );
  // Shows "Steering…" at once; the server may instead send the row as the next turn, which removes it.
  const steer = useMutation(api.queuedMessages.steer).withOptimisticUpdate((store, args) =>
    patchQueue(store, (current) => current.map((row): QueuedRow => (row._id === args.id ? { ...row, steer: "requested" } : row))),
  );

  if (!parentId || rows === undefined || rows.length === 0) return null;

  const label = queuePanelLabel({ isExecuting, queuedCount: rows.length, isSandboxActive }) ?? QUEUE_PANEL_LABEL;
  const authorById = new Map((authors ?? []).map((user) => [user._id, user]));
  const ids = rows.map((row) => row._id);
  const menuIndex = menuFor === null ? -1 : ids.indexOf(menuFor);
  const menuRow = rows[menuIndex];

  const move = (id: Id<"queuedMessages">, toIndex: number) => {
    setMenuFor(null);
    reorder({ parentId, orderedIds: moveQueuedId(ids, id, toIndex) }).catch(() => toast.error("Couldn't reorder the queued messages"));
  };

  return (
    // Web: a `bg-muted/50` card with a 16 top radius, flush on the input below (`rounded-b-none`), inset 12 each side.
    // It runs 8 into the composer's top padding, so it sits on the pill.
    <View
      className="-mb-2 mx-6 rounded-t-2xl border border-b-0 px-1.5 pt-0.5"
      style={{
        backgroundColor: withAlpha(theme.muted, 0.5),
        borderColor: theme.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${rows.length} ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        className="min-h-11 flex-row items-center gap-1.5 self-start rounded-md px-1 active:opacity-70"
      >
        <Text className="font-instrument-sans-medium text-sm" style={{ fontWeight: "500", color: theme.mutedForeground }}>
          {rows.length} {label}
        </Text>
        {/* After the text, pointing right, turning 90° while the list is open, as the web. */}
        <View style={open ? { transform: [{ rotate: "90deg" }], opacity: 0.7 } : { opacity: 0.7 }}>
          <IconChevronRight size={14} color={theme.mutedForeground} />
        </View>
      </Pressable>
      {open ? (
        <ScrollView
          style={{ maxHeight: ROW_HEIGHT * VISIBLE_ROWS }}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="pb-1.5"
        >
          {rows.map((row) => (
            <QueueRow
              key={row._id}
              row={row}
              author={authorById.get(row.userId)}
              onOpenMenu={() => setMenuFor(row._id)}
              onSteer={() => {
                steer({ id: row._id }).catch(() => toast.error("Couldn't steer with the queued message"));
              }}
            />
          ))}
        </ScrollView>
      ) : null}

      <MenuSheet
        open={menuRow !== undefined}
        onOpenChange={(next) => {
          if (!next) setMenuFor(null);
        }}
        title="Queued message"
      >
        {menuRow ? (
          <>
            <SheetRow
              icon={IconPencil}
              title="Edit"
              onPress={() => {
                setMenuFor(null);
                setEditing(menuRow);
              }}
            />
            {menuIndex > 0 ? <SheetRow icon={IconArrowBarToUp} title="Move to front" onPress={() => move(menuRow._id, 0)} /> : null}
            {menuIndex > 1 ? <SheetRow icon={IconChevronUp} title="Move up" onPress={() => move(menuRow._id, menuIndex - 1)} /> : null}
            {menuIndex < rows.length - 1 ? (
              <SheetRow icon={IconChevronDown} title="Move down" onPress={() => move(menuRow._id, menuIndex + 1)} />
            ) : null}
            <SheetRow
              icon={IconTrash}
              title="Delete"
              danger
              onPress={() => {
                setMenuFor(null);
                setDeleting(menuRow);
              }}
            />
          </>
        ) : null}
      </MenuSheet>

      <EditQueuedSheet row={editing} onClose={() => setEditing(null)} onSave={(id, content) => update({ id, content })} />

      {/* The web "Delete queued message" dialog. */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title="Delete queued message"
        description="Remove this queued prompt before it runs?"
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (!deleting) return;
          remove({ id: deleting._id }).catch(() => toast.error("Couldn't delete the queued message"));
        }}
      />
    </View>
  );
}

/**
 * One queued message: the author's initials and the model mark (or the web's
 * empty dot for a row without a model), two lines of text in the phone's 14,
 * and Steer at the end, or "Steering…" once pressed (then no actions, as the
 * web). A tap or a long press on the text opens the row's sheet.
 */
function QueueRow({
  row,
  author,
  onOpenMenu,
  onSteer,
}: {
  row: QueuedRow;
  author: FunctionReturnType<typeof api.users.getMany>[number] | undefined;
  onOpenMenu: () => void;
  onSteer: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const text = queuedMessagePreview(row.displayContent ?? row.content);
  // While it steers, the web row has no actions: the agent is taking it.
  const steering = row.steer !== undefined;
  return (
    <View className="flex-row items-center" style={{ minHeight: ROW_HEIGHT }}>
      <Pressable
        accessibilityRole={steering ? "text" : "button"}
        accessibilityLabel={text}
        accessibilityHint={steering ? undefined : "Opens the queued message actions"}
        disabled={steering}
        onPress={onOpenMenu}
        onLongPress={() => {
          impactHaptic("light");
          onOpenMenu();
        }}
        className="min-w-0 flex-1 flex-row items-center gap-2.5 self-stretch rounded-lg px-1 active:opacity-70"
      >
        {/* Who asked, then on what, as the web: a shared chat's queue mixes teammates' prompts. */}
        <InitialsAvatar user={author} size={16} />
        {row.model ? (
          <ModelIcon model={row.model} reasoningLevel={row.reasoningLevel} size={14} />
        ) : (
          <View className="size-4 items-center justify-center">
            <View className="size-2.5 rounded-full border" style={{ borderColor: withAlpha(theme.mutedForeground, 0.45) }} />
          </View>
        )}
        <Text numberOfLines={2} className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: withAlpha(theme.foreground, 0.9) }}>
          {text}
        </Text>
      </Pressable>
      {steering ? (
        <Text className="font-instrument-sans px-2 text-sm" style={{ color: theme.mutedForeground }}>
          Steering…
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Steer with queued message"
          accessibilityHint="Sends it now and redirects the running agent"
          onPress={onSteer}
          className="h-11 flex-row items-center gap-1 rounded-md px-2 active:opacity-70"
        >
          <IconSteeringWheel size={16} color={theme.mutedForeground} />
          <Text className="font-instrument-sans text-sm" style={{ color: theme.mutedForeground }}>
            Steer
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * The web "Edit queued message" dialog as a sheet: the whole message in a
 * field focused on open, Cancel, and Save, which waits for some text.
 */
function EditQueuedSheet({
  row,
  onClose,
  onSave,
}: {
  row: QueuedRow | null;
  onClose: () => void;
  onSave: (id: Id<"queuedMessages">, content: string) => Promise<null>;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const field = useRef<TextInput>(null);
  const save = () => {
    if (!row) return;
    setSaving(true);
    onSave(row._id, draft).then(
      () => {
        setSaving(false);
        onClose();
      },
      () => {
        setSaving(false);
        toast.error("Couldn't save the queued message");
      },
    );
  };
  return (
    <Sheet
      open={row !== null}
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <SheetContent
        className="gap-3 px-4"
        onShow={() => {
          setDraft(row?.displayContent ?? row?.content ?? "");
          field.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Edit queued message</SheetTitle>
        </SheetHeader>
        <SheetBody contentContainerClassName="gap-3">
          <Textarea ref={field} accessibilityLabel="Queued message" value={draft} onChangeText={setDraft} className="min-h-40" />
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" disabled={saving} onPress={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={saving || draft.trim() === ""} onPress={save}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
