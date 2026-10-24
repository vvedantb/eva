import {
  GanttColumn,
  GanttColumns,
  GanttContentHeader,
  GanttFeatureItem,
  GanttFeatureList,
  GanttFeatureListGroup,
  GanttFeatureRow,
  GanttHeader,
  GanttProvider,
  GanttSidebar,
  GanttSidebarGroup,
  GanttSidebarHeader,
  GanttSidebarItem,
  GanttTimeline,
  type GanttFeature,
  type GanttStatus,
} from "@eva/ui";
import { GalleryItem } from "./GalleryItem";

const PLANNED: GanttStatus = { id: "planned", name: "Planned", color: "#6b7280" };
const ACTIVE: GanttStatus = { id: "active", name: "Active", color: "#f59e0b" };
const DONE: GanttStatus = { id: "done", name: "Done", color: "#10b981" };

/**
 * Fixed dates in 2025. GanttProvider builds its timeline from `new Date()`
 * (currentYear - 1 … currentYear + 1), so these bars sit at the left edge
 * of the timeline while the current year is 2026. From 1 January 2027 the
 * timeline starts at 2026 and these bars fall off the left edge.
 */
const DESIGN: GanttFeature = {
  id: "g-1",
  name: "Design review",
  startAt: new Date(2025, 0, 6),
  endAt: new Date(2025, 1, 14),
  status: DONE,
};
const RUNTIME: GanttFeature = {
  id: "g-2",
  name: "Sandbox runtime",
  startAt: new Date(2025, 1, 3),
  endAt: new Date(2025, 3, 25),
  status: ACTIVE,
};
const BILLING: GanttFeature = {
  id: "g-3",
  name: "Billing migration",
  startAt: new Date(2025, 2, 10),
  endAt: new Date(2025, 5, 20),
  status: PLANNED,
};
const LAUNCH: GanttFeature = {
  id: "g-4",
  name: "Public launch",
  startAt: new Date(2025, 4, 1),
  endAt: new Date(2025, 6, 15),
  status: PLANNED,
};
const FEATURES = [DESIGN, RUNTIME, BILLING, LAUNCH];

/**
 * Two providers on purpose. With a GanttSidebar mounted, GanttProvider
 * scrolls the canvas to centre on the real "today", which changes every day.
 * Without a sidebar it never scrolls, so the timeline stays at scrollLeft 0.
 * The sidebar-only provider has no horizontal overflow, so its centring
 * scroll is clamped to 0 as well. GanttToday is left out (it marks the real
 * current date).
 */
export function KiboGantt() {
  return (
    <>
      <GalleryItem label="Gantt timeline (monthly, fixed 2025 dates, no sidebar)" className="w-full">
        <div className="h-[260px] w-[1100px]">
          <GanttProvider range="monthly" zoom={100}>
            <GanttTimeline>
              <GanttHeader />
              <GanttFeatureList>
                <GanttFeatureListGroup>
                  {FEATURES.map((feature) => (
                    <div className="flex" key={feature.id}>
                      <GanttFeatureItem {...feature} />
                    </div>
                  ))}
                </GanttFeatureListGroup>
              </GanttFeatureList>
            </GanttTimeline>
          </GanttProvider>
        </div>
      </GalleryItem>
      <GalleryItem label="GanttFeatureRow (lanes) + custom bar content" className="w-full">
        <div className="h-[240px] w-[1100px]">
          <GanttProvider range="quarterly" zoom={100}>
            <GanttTimeline>
              <GanttHeader />
              <GanttFeatureList>
                <GanttFeatureRow features={[DESIGN, RUNTIME]}>
                  {(feature) => (
                    <span className="truncate px-2 text-xs font-medium">
                      {feature.name}
                    </span>
                  )}
                </GanttFeatureRow>
                <GanttFeatureRow features={[BILLING, LAUNCH]} />
              </GanttFeatureList>
            </GanttTimeline>
          </GanttProvider>
        </div>
      </GalleryItem>
      <GalleryItem label="GanttSidebar / SidebarHeader / SidebarGroup / SidebarItem">
        <div className="h-[300px] w-[300px]">
          <GanttProvider range="monthly">
            <GanttSidebar headerTitle="Projects" headerMeta="Duration">
              <GanttSidebarGroup name="Q1">
                <GanttSidebarItem feature={DESIGN} selected />
                <GanttSidebarItem feature={RUNTIME} />
              </GanttSidebarGroup>
              <GanttSidebarGroup name="Q2">
                <GanttSidebarItem
                  feature={BILLING}
                  meta={<span className="text-muted-foreground">3 people</span>}
                />
              </GanttSidebarGroup>
            </GanttSidebar>
          </GanttProvider>
        </div>
      </GalleryItem>
      <GalleryItem label="GanttSidebarHeader / GanttContentHeader / GanttColumns / GanttColumn">
        <div className="w-[600px]">
          <GanttProvider range="monthly">
            <div className="flex flex-col">
              <GanttSidebarHeader title="Issues" metaLabel="Duration" />
              <div className="relative h-[120px]">
                <GanttContentHeader
                  title="2025"
                  columns={4}
                  renderHeaderItem={(index) => <p>{`W${index + 1}`}</p>}
                  isColumnCurrent={(index) => index === 1}
                />
                <GanttColumns columns={4} isColumnSecondary={(index) => index % 2 === 1} />
              </div>
              <div className="flex h-10">
                <GanttColumn index={0} />
                <GanttColumn index={1} isColumnSecondary={() => true} />
              </div>
            </div>
          </GanttProvider>
        </div>
      </GalleryItem>
    </>
  );
}
