import { api, type Id } from "@eva/backend";
import { filterSessionsStartedBy, perRepoQueryCache, sessionListEntries } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconPlus, IconSearch, IconTerminal2 } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { PageHeader } from "@vvedantb/native-ui/layout";
import {
  closeSwipeRows,
  EmptyState,
  HeaderIconButton,
  ListDivider,
  Pager,
  PillTabs,
  SkeletonList,
  SkeletonRow,
  type SwipeAction,
} from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { useQueries, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { SectionList, View } from "react-native";
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
import { SessionListOptionsButton, useSessionListSettings } from "@/sessions/SessionListOptions";
import { SESSION_ACTION_ITEMS, useSessionActions } from "@/sessions/useSessionActions";
import { SegmentedTabs } from "@/ui/SegmentedTabs";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";
import { lastTabSection, sectionIndex } from "@/ui/sectionIndex";
import { LIST_WINDOW } from "@/ui/listWindow";

type SessionTab = "active" | "archived";
type Section = "sessions" | "quick-tasks" | "reviews";

const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
  { id: "sessions", label: "Sessions" },
  { id: "quick-tasks", label: "Quick Tasks" },
  { id: "reviews", label: "Reviews" },
];

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
  const lastSection = lastTabSection.useValue("sessions");
  const index = sectionIndex(sections, sectionParam ?? lastSection ?? undefined);
  const showSection = (next: string | undefined) => {
    if (next) lastTabSection.set("sessions", next);
    router.setParams({ section: next });
  };
  const section = sections[index] ?? { id: "sessions", label: "Sessions" };
  const progress = useSharedValue(index);
  const { openNew: openNewQuickTask } = useQuickTaskRepo();
  const foreground = EVA_THEME[useScheme()].foreground;
  const isQuickTasks = section.id === "quick-tasks";

  return (
    <TabScreen>
      <PageHeader
        title={section.label}
        action={
          <View className="flex-row items-center gap-2">
            <HeaderIconButton label="Search" onPress={() => router.push("/search")}>
              <IconSearch size={18} color={foreground} />
            </HeaderIconButton>
            {section.id === "sessions" ? <SessionListOptionsButton /> : null}
            {section.id === "reviews" ? null : (
              <HeaderIconButton
                label={isQuickTasks ? "New quick task" : "New session"}
                onPress={isQuickTasks ? openNewQuickTask : () => router.push("/session/new")}
              >
                <IconPlus size={18} color={foreground} />
              </HeaderIconButton>
            )}
          </View>
        }
      />
      <View className="px-4 pb-2">
        <PillTabs
          options={sections}
          value={section.id}
          onChange={showSection}
          progress={progress}
        />
      </View>
      <Pager
        index={index}
        count={sections.length}
        progress={progress}
        onIndexChange={(next) => showSection(sections[next]?.id)}
        renderPage={(page) => {
          const id = sections[page]?.id;
          return id === "reviews" ? <ReviewsSection /> : id === "quick-tasks" ? <QuickTasksSection /> : <SessionsSection />;
        }}
      />
    </TabScreen>
  );
}

const SESSION_LIST_QUERIES = {
  active: api.sessions.list,
  archived: api.sessions.listArchived,
};

const sessionListQueries = perRepoQueryCache<(typeof SESSION_LIST_QUERIES)[SessionTab], Id<"githubRepos">>();

const draftMarkQueries = perRepoQueryCache<typeof api.drafts.listMarks, Id<"githubRepos">>();

function SessionsSection() {
  const router = useRouter();
  const [tab, setTab] = useState<SessionTab>("active");
  const sessionActions = useSessionActions();
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
  const [settings] = useSessionListSettings();
  const me = useQuery(api.auth.me, settings.onlyMine ? {} : "skip");
  const results = useQueries(
    sessionListQueries(
      SESSION_LIST_QUERIES[tab],
      tab,
      (repos ?? []).map((repo) => repo._id),
    ),
  );
  const draftMarks = useQueries(
    draftMarkQueries(
      api.drafts.listMarks,
      "drafts",
      (repos ?? []).map((repo) => repo._id),
    ),
  );
  const draftSessionIds = new Set<string>(Object.values(draftMarks).flatMap(markedSessionIds));
  const visibleSessions = (rows: SessionListItem[] | undefined) =>
    settings.onlyMine ? filterSessionsStartedBy(rows, me ?? undefined) : rows;
  const entries =
    repos === undefined || repos.some((repo) => results[repo._id] === undefined) || (settings.onlyMine && me === undefined)
      ? undefined
      : sessionListEntries(
          repos.map((repo) => ({ repo, sessions: visibleSessions(listedSessions(results[repo._id])) })),
          settings.appSortOrder,
        );
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  const { sections, toggleOpen, toggleExpanded } = useSessionGroups(entries, settings);

  return (
    <>
      <View className="px-4 pb-2">
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
                          sessionId: entry.group.members[0].session._id,
                          name: entry.group.name,
                          label: entry.group.label,
                                    archivable: tab === "active",
                        })
                    : undefined
                }
              />
            );
          }}
          ItemSeparatorComponent={ListDivider}
          renderItem={({ item: row }) => (
            <SessionListRow
              row={row}
              hasDraft={draftSessionIds.has(row.session._id)}
              onOpenMenu={openRowMenu}
              swipe={swipe}
              onSwipe={runSwipe}
            />
          )}
          renderSectionFooter={({ section }) => (
            <SessionGroupFooter section={section} onToggleExpanded={() => toggleExpanded(section.key)} />
          )}
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

/** One repo's `drafts.listMarks` session ids out of the `useQueries` map: none while loading or failed. */
function markedSessionIds(result: FunctionReturnType<typeof api.drafts.listMarks> | Error | undefined): Id<"sessions">[] {
  return result === undefined || result instanceof Error ? [] : result.sessionIds;
}
