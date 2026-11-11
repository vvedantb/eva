import { IconPlus } from "@tabler/icons-react-native";
import { PageHeader } from "@vvedantb/native-ui/layout";
import { tokens } from "@vvedantb/native-ui/theme";
import { Pressable } from "react-native";
import { ProjectsSection, useProjectRepo } from "@/projects/ProjectsSection";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";

/**
 * The Projects tab: the web Projects page (`ProjectsClient`) for one repo,
 * with the web "New Project" as the header "+" (`ProjectsSection`).
 */
export default function ProjectsScreen() {
  const { openNew } = useProjectRepo();
  const muted = tokens.color.muted[useScheme()];
  return (
    <TabScreen>
      <PageHeader
        title="Projects"
        action={
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
        }
      />
      <ProjectsSection />
    </TabScreen>
  );
}
