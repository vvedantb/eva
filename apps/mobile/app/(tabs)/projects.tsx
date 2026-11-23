import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconPlus } from "@tabler/icons-react-native";
import { PageHeader } from "@vvedantb/native-ui/layout";
import { HeaderIconButton, Pager, PillTabs } from "@vvedantb/native-ui/primitives";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { DocsSection } from "@/docs/DocsSection";
import { AutomationsSection } from "@/automations/AutomationsSection";
import { ProjectsSection, useProjectRepo } from "@/projects/ProjectsSection";
import { TodaySection, useMarkStandupsRead, useShowsToday } from "@/today/TodaySection";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";
import { lastTabSection, sectionIndex } from "@/ui/sectionIndex";

type Section = "projects" | "docs" | "automations" | "today";

const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
  { id: "projects", label: "Projects" },
  { id: "docs", label: "Documents" },
  { id: "automations", label: "Automations" },
  { id: "today", label: "Today" },
];

/** The section pills shown: Today only while the standup is on or has history (outside the screen, see `sectionIndex`). */
function visibleSections(showsToday: boolean) {
  return showsToday ? SECTIONS : SECTIONS.filter((option) => option.id !== "today");
}

/**
 * The Projects tab holds the web's per-repo pages that are not a place to
 * chat: Projects (`ProjectsClient`), Documents (the drawer's Documents
 * panel), Automations (the web Automations sidebar) and Today, switched by pills under the title (`?section=`)
 * or a sideways swipe on the content (`Pager`), as the Sessions tab. All
 * of them share the repo (`?repo=`). Today shows while the repo's Daily
 * standup is on, as the web sidebar, or has history (`useShowsToday`). The
 * title follows the section; only Projects has the "+" (the web "New
 * Project").
 */
export default function ProjectsScreen() {
  const router = useRouter();
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const { repo, openNew } = useProjectRepo();
  const showsToday = useShowsToday(repo?._id);
  const sections = visibleSections(showsToday);
  const lastSection = lastTabSection.useValue("projects");
  const index = sectionIndex(sections, sectionParam ?? lastSection ?? undefined);
  const showSection = (next: string | undefined) => {
    if (next) lastTabSection.set("projects", next);
    router.setParams({ section: next });
  };
  const section = sections[index] ?? { id: "projects", label: "Projects" };
  useMarkStandupsRead(repo?._id, section.id === "today");
  // Where the pages are, shared by the pager and the pill indicator.
  const progress = useSharedValue(index);
  const foreground = EVA_THEME[useScheme()].foreground;
  return (
    <TabScreen>
      <PageHeader
        title={section.label}
        action={
          section.id === "projects" ? (
            // As the Sessions "+": a round header button, as Back.
            <HeaderIconButton label="New project" onPress={openNew}>
              <IconPlus size={18} color={foreground} />
            </HeaderIconButton>
          ) : undefined
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
          switch (sections[page]?.id) {
            case "docs":
              return <DocsSection />;
            case "automations":
              return <AutomationsSection />;
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
