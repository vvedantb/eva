import { useLocalStorage } from "usehooks-ts";
import { useQueryStates } from "nuqs";
import type { ProjectSortDir, ProjectSortField } from "@eva/shared";
import type { ProjectStage } from "@eva/shared/projectStatus";
import {
  searchParser,
  sortDirParser,
  hiddenProjectStagesParser,
  projectSortFieldParser,
} from "@/lib/search-params";

type ProjectView = "kanban" | "timeline" | "list";
const PROJECT_VIEWS: readonly ProjectView[] = ["kanban", "timeline", "list"];
type SortField = ProjectSortField;
type SortDir = ProjectSortDir;
type TimelineRange = "quarterly" | "monthly" | "daily";

interface ProjectFilters {
  q: string;
  view: ProjectView;
  hiddenPhases: ProjectStage[];
  sortField: SortField;
  sortDir: SortDir;
  timelineRange: TimelineRange;
  timelineZoom: number;
}

interface ProjectLocalFilters {
  view: ProjectView;
  timelineRange: TimelineRange;
  timelineZoom: number;
}

const LOCAL_DEFAULTS: ProjectLocalFilters = {
  view: "kanban",
  timelineRange: "daily",
  timelineZoom: 100,
};

const STORAGE_KEY = "project-filters-v2";

export type { ProjectView, SortField, ProjectFilters };

export function useProjectFilters(): [
  ProjectFilters,
  (patch: Partial<ProjectFilters>) => void,
] {
  const [localFilters, setLocalFilters] = useLocalStorage<ProjectLocalFilters>(
    STORAGE_KEY,
    LOCAL_DEFAULTS,
  );

  const [urlFilters, setUrlFilters] = useQueryStates({
    q: searchParser,
    hiddenPhases: hiddenProjectStagesParser,
    sortField: projectSortFieldParser,
    sortDir: sortDirParser,
  });

  const merged = { ...LOCAL_DEFAULTS, ...localFilters };
  const filters: ProjectFilters = {
    ...merged,
    view: PROJECT_VIEWS.includes(merged.view)
      ? merged.view
      : LOCAL_DEFAULTS.view,
    ...urlFilters,
  };

  const setParams = (patch: Partial<ProjectFilters>) => {
    const { view, timelineRange, timelineZoom, ...urlPatch } = patch;
    const localPatch: Partial<ProjectLocalFilters> = {};
    if (view !== undefined) localPatch.view = view;
    if (timelineRange !== undefined) localPatch.timelineRange = timelineRange;
    if (timelineZoom !== undefined) localPatch.timelineZoom = timelineZoom;
    if (Object.keys(localPatch).length > 0) {
      setLocalFilters((prev) => ({ ...prev, ...localPatch }));
    }
    if (Object.keys(urlPatch).length > 0) {
      void setUrlFilters(urlPatch);
    }
  };

  return [filters, setParams];
}
