import { api } from "@eva/backend";
import { IconPlus, IconTerminal2 } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { PageHeader } from "@vvedantb/native-ui/layout";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  closeSwipeRows,
  EmptyState,
  ListDivider,
  Pager,
  PillTabs,
  SkeletonList,
  SkeletonRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@vvedantb/native-ui/primitives";
import { tokens, useLargerText } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QuickTasksSection, useQuickTaskRepo } from "@/quickTasks/QuickTasksSection";
import { useSimpleView } from "@/chat/ComposerFooter";
import { ReviewsSection } from "@/reviews/ReviewsSection";
import { SessionGroupFooter, SessionGroupHeader, SessionListRow, useSessionGroups } from "@/sessions/SessionGroup";
import { SESSION_ACTION_ITEMS, useSessionActions } from "@/sessions/useSessionActions";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";

type SessionTab = "active" | "archived";
type Section = "sessions" | "quick-tasks" | "reviews";

const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
  { id: "sessions", label: "Sessions" },
  { id: "quick-tasks", label: "Quick Tasks" },
  { id: "reviews", label: "Reviews" },
];

/**
 * The Sessions tab holds the web's places to work on a repo: Sessions, Quick
 * Tasks and Reviews (pull requests), switched by pills under the title
 * (`?section=`, so a link or back press keeps it), or by a sideways swipe on
 * the content (`Pager`): the content follows the finger and the pill
 * indicator moves with it. A swipe that starts on a session row and goes
 * left is the row's Archive; one that goes right, or starts anywhere else,
 * moves the section. Either way the section is set in place (`setParams`),
 * so it adds no history. The title and "+" follow the section; Reviews has
 * no "+", as the web. Simple view drops Reviews, as the web Reviews route
 * redirects away in simple view.
 */
export default function SessionsScreen() {
  const router = useRouter();
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const simpleView = useSimpleView();
  const sections = simpleView ? SECTIONS.filter((option) => option.id !== "reviews") : SECTIONS;
  const index = Math.max(0, sections.findIndex((option) => option.id === sectionParam));
  const section = sections[index] ?? { id: "sessions", label: "Sessions" };
  // Where the pages are, shared by the pager and the pill indicator.
  const progress = useSharedValue(index);
  const { openNew: openNewQuickTask } = useQuickTaskRepo();
  const muted = tokens.color.muted[useScheme()];
  const isQuickTasks = section.id === "quick-tasks";

  return (
    <TabScreen>
      <PageHeader
        title={section.label}
        action={
          section.id === "reviews" ? undefined : (
            // The web "New session" button: a 40 ghost square, radius 8, muted 14 plus.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isQuickTasks ? "New quick task" : "New session"}
              onPress={isQuickTasks ? openNewQuickTask : () => router.push("/session/new")}
              hitSlop={2}
              className="h-10 w-10 items-center justify-center rounded-lg active:opacity-70"
            >
              <IconPlus size={14} color={muted} />
            </Pressable>
          )
        }
      />
      <View className="px-4 pb-2">
        <PillTabs
          options={sections}
          value={section.id}
          onChange={(next) => router.setParams({ section: next })}
          progress={progress}
        />
      </View>
      <Pager
        index={index}
        count={sections.length}
        progress={progress}
        onIndexChange={(next) => router.setParams({ section: sections[next]?.id })}
        renderPage={(page) => {
          const id = sections[page]?.id;
          return id === "reviews" ? <ReviewsSection /> : id === "quick-tasks" ? <QuickTasksSection /> : <SessionsSection />;
        }}
      />
    </TabScreen>
  );
}

/**
 * Sessions across every repo the user can access, as the web sessions sidebar
 * at phone width: Active and Archived tabs, then one collapsible group per
 * repo (`useSessionGroups`) with Inbox-sized rows, divided as the Inbox, and
 * "Show more", in a `SectionList`. A long press on a row opens the web row menu as a sheet
 * (`useSessionActions`); a swipe left reveals its Archive (with the web
 * confirm, then the Undo toast), or Unarchive in the Archived tab.
 */
function SessionsSection() {
  const router = useRouter();
  const [tab, setTab] = useState<SessionTab>("active");
  const sessionActions = useSessionActions();
  const sessions = useQuery(api.mobile.listChats, { archived: tab === "archived" });
  // The repo logos for the group headers, from the list the web sidebar reads.
  const repos = useQuery(api.githubRepos.list, {});
  const scheme = useScheme();
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  const { sections, toggleOpen, toggleExpanded } = useSessionGroups(sessions);

  return (
    <>
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
        <SkeletonList
          label="Loading sessions"
          count={8}
          renderRow={(row) => <SkeletonRow index={row} leading={10} />}
        />
      ) : sessions.length === 0 ? (
        // The web sidebar's empty copy (`GlobalSessionGroup`).
        <EmptyState
          icon={IconTerminal2}
          title={tab === "archived" ? "No archived sessions" : "No sessions yet"}
          description={tab === "archived" ? "Archive a thread from its menu." : "Press + to start one."}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(session) => session.sessionId}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <SessionGroupHeader
              section={section}
              logoUrl={repos?.find((repo) => repo._id === section.repoId)?.logoUrl}
              // The web counts running sessions, and offers "+", in the Active list only.
              live={tab === "active" ? section.rows.filter((row) => row.status === "active").length : 0}
              onToggle={() => toggleOpen(section.repoId)}
              onNew={
                tab === "active"
                  ? () => router.push({ pathname: "/session/new", params: { repo: section.repoId } })
                  : undefined
              }
            />
          )}
          // The Inbox hairline between the rows of a group.
          ItemSeparatorComponent={ListDivider}
          renderItem={({ item: session }) => {
            const target = { ...session, archived: tab === "archived" };
            const action = tab === "archived" ? "unarchive" : "archive";
            const item = SESSION_ACTION_ITEMS[action];
            return (
              <SessionListRow
                session={session}
                onLongPress={() => sessionActions.openSheet(target)}
                swipeAction={{
                  key: action,
                  label: item.label,
                  icon: item.icon,
                  tone: item.warning ? "warning" : "default",
                  onPress: () => sessionActions.run(action, target),
                }}
              />
            );
          }}
          renderSectionFooter={({ section }) => (
            <SessionGroupFooter section={section} onToggleExpanded={() => toggleExpanded(section.repoId)} />
          )}
          // A scroll closes a row swiped open.
          onScrollBeginDrag={closeSwipeRows}
          contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) }}
        />
      )}
      {sessionActions.dialogs}
    </>
  );
}
