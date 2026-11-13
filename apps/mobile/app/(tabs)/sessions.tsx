import { api, type Id } from "@eva/backend";
import { perRepoQueryCache, sessionListEntries } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconPlus, IconTerminal2 } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { PageHeader } from "@vvedantb/native-ui/layout";
import {
  closeSwipeRows,
  EmptyState,
  ListDivider,
  Pager,
  PillTabs,
  SkeletonList,
  SkeletonRow,
  type SwipeAction,
} from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { useQueries, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QuickTasksSection, useQuickTaskRepo } from "@/quickTasks/QuickTasksSection";
import { useSimpleView } from "@/chat/ComposerFooter";
import { ReviewsSection } from "@/reviews/ReviewsSection";
import {
  SessionGroupFooter,
  SessionGroupHeader,
  SessionListRow,
  sessionActionTarget,
  useSessionGroups,
  type SessionListItem,
  type SessionRow,
} from "@/sessions/SessionGroup";
import { SESSION_ACTION_ITEMS, useSessionActions } from "@/sessions/useSessionActions";
import { SegmentedTabs } from "@/ui/SegmentedTabs";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";
import { sectionIndex } from "@/ui/sectionIndex";
import { LIST_WINDOW } from "@/ui/listWindow";

type SessionTab = "active" | "archived";
type Section = "sessions" | "quick-tasks" | "reviews";

const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
  { id: "sessions", label: "Sessions" },
  { id: "quick-tasks", label: "Quick Tasks" },
  { id: "reviews", label: "Reviews" },
];

/** The section pills shown: simple view drops Reviews (outside the screen, see `sectionIndex`). */
function visibleSections(simpleView: boolean) {
  return simpleView ? SECTIONS.filter((option) => option.id !== "reviews") : SECTIONS;
}

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
  const sections = visibleSections(simpleView);
  const index = sectionIndex(sections, sectionParam);
  const section = sections[index] ?? { id: "sessions", label: "Sessions" };
  // Where the pages are, shared by the pager and the pill indicator.
  const progress = useSharedValue(index);
  const { openNew: openNewQuickTask } = useQuickTaskRepo();
  const muted = EVA_THEME[useScheme()].mutedForeground;
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

/** The web sidebar's list query for each tab (`GlobalSessionsSidebar`). */
const SESSION_LIST_QUERIES = {
  active: api.sessions.list,
  archived: api.sessions.listArchived,
};

/** One list query per repo for the tab, cached so `useQueries` keeps its subscriptions. */
const sessionListQueries = perRepoQueryCache<(typeof SESSION_LIST_QUERIES)[SessionTab], Id<"githubRepos">>();

/**
 * Sessions across every repo the user can access, as the web sessions sidebar
 * at phone width, from the same subscriptions: `githubRepos.list`, then one
 * `sessions.list` (Active) or `sessions.listArchived` (Archived) per repo.
 * Active and Archived tabs, then linked-session groups and repos as
 * collapsible sections (`useSessionGroups`) with Inbox-sized rows, divided as
 * the Inbox, and "Show more", in a `SectionList`. A long press on a row opens
 * the web row menu as a sheet (`useSessionActions`), and on a linked group's
 * header its Rename group; a swipe left reveals a row's Archive (with the web
 * confirm, then the Undo toast), or Unarchive in the Archived tab.
 */
function SessionsSection() {
  const router = useRouter();
  const [tab, setTab] = useState<SessionTab>("active");
  const sessionActions = useSessionActions();
  // The row menu and its swipe action, the same for every row in this tab.
  const swipeKind = tab === "archived" ? "unarchive" : "archive";
  const swipeItem = SESSION_ACTION_ITEMS[swipeKind];
  const swipe: Omit<SwipeAction, "onPress"> = {
    key: swipeKind,
    label: swipeItem.label,
    icon: swipeItem.icon,
    tone: swipeItem.warning ? "warning" : "default",
  };
  const openRowMenu = (row: SessionRow) => sessionActions.openSheet(sessionActionTarget(row));
  const runSwipe = (row: SessionRow) => sessionActions.run(swipeKind, sessionActionTarget(row));
  const repos = useQuery(api.githubRepos.list, {});
  const results = useQueries(
    sessionListQueries(
      SESSION_LIST_QUERIES[tab],
      tab,
      (repos ?? []).map((repo) => repo._id),
    ),
  );
  // Loading until every repo's list answers. A failed list (an `Error`) leaves
  // its repo out rather than holding the whole tab on the skeleton.
  const entries =
    repos === undefined || repos.some((repo) => results[repo._id] === undefined)
      ? undefined
      : sessionListEntries(
          repos.map((repo) => ({ repo, sessions: listedSessions(results[repo._id]) })),
          // The web default "Sort projects": by the newest row each section shows.
          "updated_at",
        );
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  const { sections, toggleOpen, toggleExpanded } = useSessionGroups(entries);

  return (
    <>
      <View className="px-4 pb-2">
        {/* The web `SessionsListModeTabs`. */}
        <SegmentedTabs
          value={tab}
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
          onChange={setTab}
        />
      </View>
      {entries === undefined ? (
        <SkeletonList
          label="Loading sessions"
          count={8}
          renderRow={(row) => <SkeletonRow index={row} leading={10} />}
        />
      ) : sections.length === 0 ? (
        // The web sidebar's empty copy (`GlobalSessionGroup`).
        <EmptyState
          icon={IconTerminal2}
          title={tab === "archived" ? "No archived sessions" : "No sessions yet"}
          description={tab === "archived" ? "Archive a thread from its menu." : "Press + to start one."}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(row) => row.session._id}
          stickySectionHeadersEnabled={false}
          {...LIST_WINDOW}
          renderSectionHeader={({ section }) => {
            const { entry } = section;
            return (
              <SessionGroupHeader
                section={section}
                // The web counts running sessions, and offers "+", on an app in the Active list only.
                live={tab === "active" ? section.rows.filter((row) => row.session.status === "active").length : 0}
                onToggle={() => toggleOpen(section.key)}
                onNew={
                  tab === "active" && entry.kind === "repo"
                    ? () => router.push({ pathname: "/session/new", params: { repo: entry.repo._id } })
                    : undefined
                }
                onLongPress={
                  entry.kind === "group"
                    ? () =>
                        sessionActions.openGroupSheet({
                          // The oldest member, as the web group's rename.
                          sessionId: entry.group.members[0].session._id,
                          name: entry.group.name,
                          label: entry.group.label,
                        })
                    : undefined
                }
              />
            );
          }}
          // The Inbox hairline between the rows of a group.
          ItemSeparatorComponent={ListDivider}
          // Stable handlers and swipe look, so a row whose session did not change keeps its output.
          renderItem={({ item: row }) => (
            <SessionListRow row={row} onOpenMenu={openRowMenu} swipe={swipe} onSwipe={runSwipe} />
          )}
          renderSectionFooter={({ section }) => (
            <SessionGroupFooter section={section} onToggleExpanded={() => toggleExpanded(section.key)} />
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

/**
 * One repo's rows out of the `useQueries` map, as the web sidebar reads it:
 * a failed query (an `Error` value) has no rows.
 */
function listedSessions(result: SessionListItem[] | Error | undefined): SessionListItem[] | undefined {
  return result === undefined || result instanceof Error ? undefined : result;
}
