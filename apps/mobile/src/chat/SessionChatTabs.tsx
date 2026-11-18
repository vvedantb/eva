import { api, type Doc, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react-native";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SheetRow,
  MenuSheet,
} from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { WorkingMark } from "@/ui/RowStatus";
import { useScheme } from "@/ui/theme";

/**
 * The web `ChatTabsBar` under a session chat's header: one tab per chat,
 * Main first, the open one tinted, a working mark on a chat running a turn,
 * then "+" for a new chat that runs alongside the others on the same
 * sandbox (`sessionChats.create`, from the open chat, as the web). A tap
 * opens a chat in place of this one; a long press offers Rename and, on a
 * parallel chat, Delete behind the web confirm. "+" is hidden on an archived
 * session, as the web. Always shown in a session chat, as the web, so "+"
 * can be found.
 */
export function SessionChatTabs({
  sessionId,
  activeChatId,
  archived,
}: {
  sessionId: Id<"sessions">;
  activeChatId: Id<"sessionChats">;
  archived: boolean;
}) {
  const theme = EVA_THEME[useScheme()];
  const router = useRouter();
  const chats = useQuery(api.sessionChats.listForSession, { sessionId });
  const statuses = useQuery(api.turns.listSessionChatStatuses, { sessionId });
  const create = useMutation(api.sessionChats.create);
  const rename = useMutation(api.sessionChats.rename);
  const remove = useMutation(api.sessionChats.remove);
  const [creating, setCreating] = useState(false);
  const [menuFor, setMenuFor] = useState<Doc<"sessionChats"> | null>(null);
  const [renaming, setRenaming] = useState<{ chat: Doc<"sessionChats">; title: string } | null>(null);
  const [deleting, setDeleting] = useState<Doc<"sessionChats"> | null>(null);
  // Chats closed before tabs became permanent stay hidden, as the web.
  const open = (chats ?? []).filter((chat) => chat.archived !== true);
  if (open.length === 0) return null;
  const running = new Set<string>((statuses ?? []).map((status) => status.chatId));
  const go = (chatId: Id<"sessionChats">) => router.replace({ pathname: "/chat/[target]", params: { target: chatId } });

  const newChat = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await create({ sessionId, fromChatId: activeChatId });
      toast.success("New chat opened");
      go(created._id);
    } catch {
      toast.error("Couldn't open a new chat");
    }
    setCreating(false);
  };

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="Chats"
        className="grow-0"
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8, gap: 6, alignItems: "center" }}
      >
        {open.map((chat) => {
          const active = chat._id === activeChatId;
          return (
            <Pressable
              key={chat._id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={running.has(chat._id) ? `${chat.title}, working` : chat.title}
              onPress={() => (active ? undefined : go(chat._id))}
              onLongPress={() => setMenuFor(chat)}
              hitSlop={{ top: 4, bottom: 4 }}
              className="h-9 max-w-48 flex-row items-center gap-1.5 rounded-full px-3 active:opacity-70"
              style={{ backgroundColor: active ? theme.secondary : "transparent", borderWidth: 1, borderColor: active ? theme.secondary : theme.border }}
            >
              {running.has(chat._id) ? <WorkingMark /> : null}
              <Text
                numberOfLines={1}
                className="font-instrument-sans-medium shrink text-sm"
                style={{ fontWeight: "500", color: active ? theme.foreground : theme.mutedForeground }}
              >
                {chat.title}
              </Text>
            </Pressable>
          );
        })}
        {archived ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New chat"
            accessibilityHint="Runs alongside the others on the same sandbox"
            disabled={creating}
            onPress={() => void newChat()}
            className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: withAlpha(theme.foreground, 0.05) }}
          >
            <IconPlus size={16} color={theme.mutedForeground} />
          </Pressable>
        )}
      </ScrollView>

      <MenuSheet open={menuFor !== null} onOpenChange={(next) => (next ? undefined : setMenuFor(null))} title={menuFor?.title ?? ""}>
        <SheetRow
          icon={IconPencil}
          title="Rename"
          onPress={() => {
            if (menuFor) setRenaming({ chat: menuFor, title: menuFor.title });
            setMenuFor(null);
          }}
        />
        {menuFor && !menuFor.isMain ? (
          <SheetRow
            icon={IconTrash}
            title="Delete"
            danger
            onPress={() => {
              setDeleting(menuFor);
              setMenuFor(null);
            }}
          />
        ) : null}
      </MenuSheet>
      <Dialog open={renaming !== null} onOpenChange={(next) => (next ? undefined : setRenaming(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            accessibilityLabel="Chat name"
            value={renaming?.title ?? ""}
            onChangeText={(title) => setRenaming(renaming ? { ...renaming, title } : null)}
            returnKeyType="done"
          />
          <DialogFooter>
            <Button variant="ghost" onPress={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              disabled={!renaming?.title.trim()}
              onPress={() => {
                if (!renaming) return;
                rename({ chatId: renaming.chat._id, title: renaming.title.trim() }).then(
                  () => toast.success("Chat renamed"),
                  () => toast.error("Couldn't rename chat"),
                );
                setRenaming(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => (next ? undefined : setDeleting(null))}
        title="Delete this chat?"
        description={`${deleting?.title ?? "This chat"} and all its messages are deleted. This cannot be undone.`}
        confirmLabel="Delete chat"
        variant="destructive"
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          // Deleting the open chat moves to Main, as the web.
          const main = open.find((chat) => chat.isMain);
          remove({ chatId: target._id }).then(
            () => {
              toast.success("Chat deleted");
              if (target._id === activeChatId && main) go(main._id);
            },
            () => toast.error("Couldn't delete chat"),
          );
        }}
      />
    </>
  );
}
