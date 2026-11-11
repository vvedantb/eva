import { IconPlus } from "@tabler/icons-react-native";
import { PageHeader } from "@vvedantb/native-ui/layout";
import { Pager, PillTabs } from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { DocsSection } from "@/docs/DocsSection";
import { DraftsSection } from "@/drafts/DraftsSection";
import { ProjectsSection, useProjectRepo } from "@/projects/ProjectsSection";
import { TodaySection, useShowsToday } from "@/today/TodaySection";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";

type Section = "projects" | "docs" | "drafts" | "today";

const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
  { id: "projects", label: "Projects" },
  { id: "docs", label: "Documents" },
  { id: "drafts", label: "Drafts" },
  { id: "today", label: "Today" },
];

/**
 * The Projects tab holds the web's per-repo pages that are not a place to
 * chat: Projects (`ProjectsClient`), Documents (the drawer's Documents
 * panel), Drafts and Today, switched by pills under the title (`?section=`)
 * or a sideways swipe on the content (`Pager`), as the Sessions tab. All
 * four share the repo (`?repo=`). Today shows while the repo's Daily
 * standup is on, as the web sidebar, or has history (`useShowsToday`). The
 * title follows the section; only Projects has the "+" (the web "New
 * Project").
 */
export default function ProjectsScreen() {
  const router = useRouter();
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const { repo, openNew } = useProjectRepo();
  const showsToday = useShowsToday(repo?._id);
  const sections = showsToday ? SECTIONS : SECTIONS.filter((option) => option.id !== "today");
  const index = Math.max(0, sections.findIndex((option) => option.id === sectionParam));
  const section = sections[index] ?? { id: "projects", label: "Projects" };
  // Where the pages are, shared by the pager and the pill indicator.
  const progress = useSharedValue(index);
  const muted = tokens.color.muted[useScheme()];
  return (
    <TabScreen>
      <PageHeader
        title={section.label}
        action={
          section.id === "projects" ? (
            // As the Sessions "+": a 40 ghost square, radius 8, muted 14 plus.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New project"
              onPress={openNew}
              hitSlop={2}
              className="h-10 w-10 items-center justify-center rounded-lg active:opacity-70"
            >
              <IconPlus size={14} color={muted} />
            </Pressable>
          ) : undefined
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
          switch (sections[page]?.id) {
            case "docs":
              return <DocsSection />;
            case "drafts":
              return <DraftsSection />;
            case "today":
              return <TodaySection />;
            default:
              return <ProjectsSection />;
          }
        }}
      />
    </TabScreen>
  );
}
