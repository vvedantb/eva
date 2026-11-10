import { api } from "@eva/backend";
import { IconPlus, IconTerminal2 } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { PageHeader } from "@vvedantb/native-ui/layout";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { CenteredSpinner, EmptyState, Tabs, TabsList, TabsTrigger } from "@vvedantb/native-ui/primitives";
import { tokens, useLargerText } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SessionGroup } from "@/sessions/SessionGroup";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";

type SessionTab = "active" | "archived";

/**
 * Sessions across every repo the user can access, as the web sessions sidebar
 * at phone width: Active and Archived tabs, then one collapsible group per
 * repo (`SessionGroup`) with compact rows and "Show more".
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
          {[...groups].map(([repoLabel, rows]) => (
            <SessionGroup
              key={repoLabel}
              repoLabel={repoLabel}
              rows={rows}
              // The web counts running sessions in the Active list only.
              live={tab === "active" ? rows.filter((row) => row.status === "active").length : 0}
            />
          ))}
        </ScrollView>
      )}
    </TabScreen>
  );
}
