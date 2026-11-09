import { api } from "@eva/backend";
import { IconPlus, IconTerminal2 } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { PageHeader } from "@vvedantb/native-ui/layout";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { CenteredSpinner, EmptyState, Tabs, TabsList, TabsTrigger } from "@vvedantb/native-ui/primitives";
import { palette, tokens, useLargerText, withAlpha } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { timeAgo } from "@/ui/format";
import { RowStatus } from "@/ui/RowStatus";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme, XS_TRACKING } from "@/ui/theme";

type SessionTab = "active" | "archived";

/**
 * Sessions across every repo the user can access, as the web sessions sidebar
 * at phone width: Active and Archived tabs, one group per repo (its initial,
 * name and live-session count), compact rows with the status, title and time.
 */
export default function SessionsScreen() {
  const [tab, setTab] = useState<SessionTab>("active");
  const sessions = useQuery(api.mobile.listChats, { archived: tab === "archived" });
  const router = useRouter();
  const scheme = useScheme();
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  const muted = tokens.color.muted[scheme];

  // Repos in order of their newest session; sessions stay newest first.
  const groups = new Map<string, NonNullable<typeof sessions>>();
  for (const session of sessions ?? []) {
    groups.set(session.repoLabel, [...(groups.get(session.repoLabel) ?? []), session]);
  }

  return (
    <TabScreen>
      <PageHeader
        title="Sessions"
        action={
          // The web "New session" button: a 40 ghost square, radius 8, muted 14 plus.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New session"
            onPress={() => router.push("/session/new")}
            hitSlop={2}
            className="h-10 w-10 items-center justify-center rounded-lg active:opacity-70"
          >
            <IconPlus size={14} color={muted} />
          </Pressable>
        }
      />
      <View className="px-4 pb-2">
        <Tabs value={tab} onValueChange={(value: string) => setTab(value === "archived" ? "archived" : "active")}>
          {/* The web `SessionsListModeTabs`: an `h-8` `tabs-segmented` list with
          `sm` triggers (24 high). Its dark trough is the card colour. */}
          <TabsList
            variant="segmented"
            size="sm"
            className="gap-0 self-stretch p-1"
            style={scheme === "dark" ? { backgroundColor: EVA_THEME.dark.card } : undefined}
          >
            {(["active", "archived"] as const).map((value) => (
              <TabsTrigger key={value} value={value} className="flex-1" minHeight={largerText ? undefined : 24}>
                {value === "active" ? "Active" : "Archived"}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </View>
      {sessions === undefined ? (
        <CenteredSpinner label="Loading sessions" />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={IconTerminal2}
          title={tab === "archived" ? "No archived sessions" : "No sessions"}
          description={tab === "archived" ? undefined : "Start a session on the web. It shows up here."}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) }}>
          {[...groups].map(([repoLabel, rows]) => {
            const live = rows.filter((row) => row.status === "active").length;
            return (
              <View key={repoLabel} className="pb-2">
                {/* Web group header: 18 round initial on `bg-muted`, text-xs medium muted name, green dot + live count. */}
                <View className="flex-row items-center gap-2 px-4 py-2">
                  <View
                    className="h-[18px] w-[18px] items-center justify-center rounded-full"
                    style={{ backgroundColor: EVA_THEME[scheme].muted }}
                  >
                    <Text
                      className="font-instrument-sans-semibold"
                      style={{ fontSize: 10, color: muted, fontWeight: "600" }}
                    >
                      {repoLabel.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text
                    className="font-instrument-sans-medium text-xs"
                    style={{ color: muted, fontWeight: "500", letterSpacing: XS_TRACKING }}
                  >
                    {repoLabel}
                  </Text>
                  {live > 0 ? (
                    <View className="flex-row items-center gap-1 px-1.5" accessibilityLabel={`${live} running`}>
                      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: palette.success[scheme] }} />
                      <Text
                        className="font-instrument-sans-medium text-xs"
                        style={{ color: muted, fontWeight: "500", fontVariant: ["tabular-nums"] }}
                      >
                        {live}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {rows.map((session) => (
                  <Pressable
                    key={session.sessionId}
                    accessibilityRole="button"
                    accessibilityLabel={session.title}
                    onPress={() => router.push({ pathname: "/chat/[target]", params: { target: session.sessionId } })}
                    // Web rows are py-1.5; 44 high here for touch.
                    className="min-h-11 flex-row items-center gap-2 px-4 active:opacity-70"
                  >
                    <RowStatus
                      awaitingAnswer={session.isAwaitingAnswer}
                      // `cancelled` is the muted 40% dot, the web idle `bg-muted-foreground/40`.
                      tone={session.status === "active" ? "active" : "cancelled"}
                    />
                    {/* The web title: `text-2sm leading-[18px]` (13 / 18) at 80% foreground. */}
                    <Text
                      numberOfLines={1}
                      className="font-instrument-sans flex-1 text-[13px] leading-[18px]"
                      style={{ color: withAlpha(tokens.color.foreground[scheme], 0.8), letterSpacing: 0.065 }}
                    >
                      {session.title}
                    </Text>
                    {/* The web age: `text-2xs` (11 / 16, 0.01em). */}
                    <Text
                      className="font-instrument-sans text-[11px] leading-4"
                      style={{ color: muted, letterSpacing: 0.11, fontVariant: ["tabular-nums"] }}
                    >
                      {timeAgo(session.updatedAt)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </TabScreen>
  );
}
