import { api } from "@eva/backend";
import { repoForHref } from "@eva/shared/appHref";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { GROUP_LABEL, groupHits, isHitType, SPOTLIGHT_PLACEHOLDER, type HitType } from "@eva/shared/spotlight";
import {
  IconBox,
  IconChecklist,
  IconChevronLeft,
  IconFileCode,
  IconFileText,
  IconFolder,
  IconGitPullRequest,
  IconLayoutKanban,
  IconPencil,
  IconRobot,
  IconSearch,
  IconTerminal2,
  IconUsers,
  type IconProps,
} from "@tabler/icons-react-native";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { Input, SheetRow } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { useDeferredValue, useState, type ComponentType } from "react";
import { Pressable, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { openAppLink } from "@/push/openLink";
import { jsonParser, persistedStore } from "@/storage/persistedStore";
import { useScheme } from "@/ui/theme";

/** One row: a result, or a recent one (whose type is a plain string, as it may predate a rename). */
type Row = { type: string; title: string; subtitle: string; href: string };

const TYPE_ICON: Record<HitType, ComponentType<IconProps>> = {
  page: IconFolder,
  repo: IconBox,
  team: IconUsers,
  project: IconLayoutKanban,
  task: IconChecklist,
  draft: IconPencil,
  session: IconTerminal2,
  pr: IconGitPullRequest,
  doc: IconFileText,
  automation: IconRobot,
  artifact: IconFileCode,
};

const iconFor = (type: string) => (isHitType(type) ? TYPE_ICON[type] : IconSearch);

/** The web Recents: the last results opened, newest first, on this device. */
const RECENT_LIMIT = 8;
const recentRow = z.object({ type: z.string(), title: z.string(), subtitle: z.string(), href: z.string() });
const recentsStore = persistedStore<readonly Row[]>("spotlightRecents", [], jsonParser(z.array(recentRow)));

/**
 * A page link the phone has a tab for: the Inbox, Sessions (with its Quick
 * Tasks and Reviews sections) and Projects, in or outside a repo. Null for the
 * rest (Documents, Automations, Stats, a repo's Settings...), which open on the web.
 */
function tabForPage(path: string): Href | null {
  const last = path.split(/[?#]/)[0]?.split("/").filter(Boolean).pop();
  switch (last) {
    case "inbox":
    case "home":
      return "/";
    case "sessions":
      return "/sessions";
    case "quick-tasks":
      return { pathname: "/sessions", params: { section: "quick-tasks" } };
    case "reviews":
      return { pathname: "/sessions", params: { section: "reviews" } };
    case "projects":
      return "/projects";
    default:
      return null;
  }
}

/**
 * The web spotlight (⌘K, `SpotlightSearch`) as a screen, opened from the
 * Sessions tab's search button: a field at the top, then Recent (before you
 * type) or the results in the web's groups (`spotlight.search`). A result
 * opens its phone screen when there is one (a session, task, project, doc or
 * pull request; a tab for a page), else the web, as a notification link does.
 * Not here from the web: its actions (toggle sidebar, theme, shortcuts).
 */
export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = EVA_THEME[useScheme()];
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const results = useQuery(api.spotlight.search, query.trim() === "" ? "skip" : { query, limit: 40 });
  const repos = useQuery(api.githubRepos.list, {});
  const recents = recentsStore.useValue("all");

  const open = (row: Row) => {
    recentsStore.set("all", [row, ...recentsStore.get("all").filter((entry) => entry.href !== row.href)].slice(0, RECENT_LIMIT));
    const tab = row.type === "page" ? tabForPage(row.href) : null;
    if (tab) {
      router.navigate(tab);
      return;
    }
    // A repo link opens its phone screen when it names one (Back returns here); `openAppLink` falls back to the web.
    openAppLink({ href: row.href, repoId: repos ? repoForHref(repos, row.href)?._id : undefined });
  };

  const sections =
    search.trim() === ""
      ? recents.length > 0
        ? [{ title: "Recent", data: [...recents] }]
        : []
      : groupHits(results ?? []).map((group) => ({ title: GROUP_LABEL[group.type], data: group.items }));

  return (
    <View className="flex-1" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-1 px-2 pb-2 pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => goBackOrReplace(router, "/sessions")}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
        >
          <IconChevronLeft size={20} color={theme.foreground} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Input
            autoFocus
            accessibilityLabel="Search"
            placeholder={SPOTLIGHT_PLACEHOLDER}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(row, index) => `${row.href}:${index}`}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 16 }}
        renderSectionHeader={({ section }) => (
          <Text className="font-instrument-sans-medium px-2 pb-1 pt-4 text-xs" style={{ color: theme.mutedForeground, fontWeight: "500" }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <SheetRow icon={iconFor(item.type)} title={item.title} detail={item.subtitle || undefined} onPress={() => open(item)} />
        )}
        ListEmptyComponent={
          search.trim() === "" ? null : (
            <Text className="font-instrument-sans py-12 text-center text-sm" style={{ color: theme.mutedForeground }}>
              {results === undefined ? "Searching…" : "No results found"}
            </Text>
          )
        }
      />
    </View>
  );
}
