import { useLocalStorage } from "usehooks-ts";
import { useQueryStates } from "nuqs";
import type { ProjectSortDir, ProjectSortField } from "@eva/shared";
import type { ProjectPhase } from "@/lib/components/projects/ProjectPhaseBadge";
import {
  searchParser,
  sortDirParser,
  hiddenProjectPhasesParser,
  projectSortFieldParser,
} from "@/lib/search-params";

type ProjectView = "kanban" | "timeline" | "list";
const PROJECT_VIEWS: readonly ProjectView[] = ["kanban", "timeline", "list"];
type SortField = ProjectSortField;
type SortDir = ProjectSortDir;
// Timeline axis granularity. Maps 1:1 to the Gantt engine's `Range`
// ("daily" renders day columns, surfaced to users as the "Week" zoom).
type TimelineRange = "quarterly" | "monthly" | "daily";

interface ProjectFilters {
  q: string;
  view: ProjectView;
  // Phases the user has hidden (blocklist). Empty = all phases visible.
  // Storing exclusions (not the visible allowlist) keeps "no filter" stable
  // and makes any newly-added phase visible by default.
  hiddenPhases: ProjectPhase[];
  sortField: SortField;
  sortDir: SortDir;
  // Timeline view only: axis granularity + zoom (percent). Other views ignore.
  timelineRange: TimelineRange;
  timelineZoom: number;
}

// Per-user presentation preferences — kept in localStorage. Search, phase
// filter, and sort are shareable "what you're looking at" state that lives
// in the URL via nuqs — see the parsers below.
interface ProjectLocalFilters {
  view: ProjectView;
  timelineRange: TimelineRange;
  timelineZoom: number;
}

const LOCAL_DEFAULTS: ProjectLocalFilters = {
  view: "kanban",
  // Weekly grid by default, matching Linear's default timeline zoom.
  timelineRange: "daily",
  timelineZoom: 100,
};

// Bumped from "project-filters": the old shape persisted a visible-phase
// allowlist, which left newly-added phases stuck off for existing users.
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
    hiddenPhases: hiddenProjectPhasesParser,
    sortField: projectSortFieldParser,
    sortDir: sortDirParser,
  });

  // Merge defaults on read so objects persisted before new keys existed
  // (or before the URL-state split) backfill without a STORAGE_KEY bump.
  const merged = { ...LOCAL_DEFAULTS, ...localFilters };
  const filters: ProjectFilters = {
    ...merged,
    // The removed "table" view can still be sitting in a returning user's
    // storage, so anything that is not a live view falls back to the default.
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
