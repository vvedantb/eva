import { LazyMotion, domMax } from "motion/react";
import {
  Avatar,
  AvatarFallback,
  AvatarStack,
  ContributionGraph,
  ContributionGraphBlock,
  ContributionGraphCalendar,
  ContributionGraphFooter,
  ContributionGraphLegend,
  ContributionGraphTotalCount,
  Cursor,
  CursorBody,
  CursorName,
  CursorPointer,
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
  ListGroup,
  ListHeader,
  ListItem,
  ListItems,
  ListProvider,
  ThemeSwitcher,
  VideoPlayer,
  VideoPlayerContent,
  VideoPlayerControlBar,
  VideoPlayerFullscreenButton,
  VideoPlayerMuteButton,
  VideoPlayerPlayButton,
  VideoPlayerPlaybackRateButton,
  VideoPlayerSeekBackwardButton,
  VideoPlayerSeekForwardButton,
  VideoPlayerTimeDisplay,
  VideoPlayerTimeRange,
  VideoPlayerVolumeRange,
} from "@vvedantb/ui";
import type { Activity, KanbanColumnDef, KanbanItem } from "@vvedantb/ui";
import { GalleryGroup, GalleryItem } from "./GalleryItem";
import { KiboGantt } from "./KiboGantt";

const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { id: "todo", name: "To do" },
  { id: "doing", name: "In progress" },
  { id: "done", name: "Done" },
];

const KANBAN_ITEMS: KanbanItem[] = [
  { id: "k-1", name: "Write migration plan", column: "todo" },
  { id: "k-2", name: "Port Button family", column: "todo" },
  { id: "k-3", name: "Capture baselines", column: "doing" },
  { id: "k-4", name: "Pixel diff harness", column: "done" },
  { id: "k-5", name: "Gallery route", column: "done" },
];

const LIST_GROUPS = [
  {
    id: "backlog",
    name: "Backlog",
    color: "#6b7280",
    items: ["Audit tokens", "Remove legacy CSS"],
  },
  {
    id: "active",
    name: "Active",
    color: "#f59e0b",
    items: ["Swap Tabs", "Swap Dialog"],
  },
];

/** Every day of 2025 with a fixed count/level pattern (no randomness). */
function buildActivity(): Activity[] {
  const days: Activity[] = [];
  for (let day = 0; day < 365; day++) {
    const date = new Date(Date.UTC(2025, 0, 1 + day))
      .toISOString()
      .slice(0, 10);
    const count = (day * 7 + Math.floor(day / 5)) % 11;
    days.push({ date, count, level: Math.min(4, Math.floor(count / 2.5)) });
  }
  return days;
}

const ACTIVITY = buildActivity();

/** 1×1 transparent GIF: a poster with no network request. */
const POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const noop = () => {};

export function KiboSection() {
  return (
    <>
      <GalleryGroup title="Kanban">
        <GalleryItem
          label="KanbanProvider / Board / Header / Cards / Card"
          className="w-full"
        >
          <KanbanProvider
            columns={KANBAN_COLUMNS}
            data={KANBAN_ITEMS}
            className="grid w-[840px] grid-cols-3 gap-3"
          >
            {KANBAN_COLUMNS.map((column) => (
              <KanbanBoard id={column.id} key={column.id}>
                <KanbanHeader>{column.name}</KanbanHeader>
                <KanbanCards id={column.id} className="p-2">
                  {(item) => (
                    <KanbanCard id={item.id} key={item.id}>
                      <p className="text-sm font-medium">{item.name}</p>
                    </KanbanCard>
                  )}
                </KanbanCards>
              </KanbanBoard>
            ))}
          </KanbanProvider>
        </GalleryItem>
      </GalleryGroup>

      <GalleryGroup title="List">
        <GalleryItem
          label="ListProvider / Group / Header / Items / Item"
          className="w-[420px]"
        >
          <ListProvider onDragEnd={noop}>
            {LIST_GROUPS.map((group) => (
              <ListGroup id={group.id} key={group.id}>
                <ListHeader name={group.name} color={group.color} />
                <ListItems>
                  {group.items.map((name, index) => (
                    <ListItem
                      id={`${group.id}-${index}`}
                      index={index}
                      key={name}
                      name={name}
                      parent={group.id}
                    />
                  ))}
                </ListItems>
              </ListGroup>
            ))}
          </ListProvider>
        </GalleryItem>
      </GalleryGroup>

      <GalleryGroup title="Gantt">
        <KiboGantt />
      </GalleryGroup>

      <GalleryGroup title="ContributionGraph">
        <GalleryItem label="Calendar / Block / Footer / TotalCount / Legend (2025, fixed data)">
          <ContributionGraph data={ACTIVITY}>
            <ContributionGraphCalendar>
              {({ activity, dayIndex, weekIndex }) => (
                <ContributionGraphBlock
                  activity={activity}
                  dayIndex={dayIndex}
                  weekIndex={weekIndex}
                />
              )}
            </ContributionGraphCalendar>
            <ContributionGraphFooter>
              <ContributionGraphTotalCount />
              <ContributionGraphLegend />
            </ContributionGraphFooter>
          </ContributionGraph>
        </GalleryItem>
      </GalleryGroup>

      <GalleryGroup title="VideoPlayer">
        <GalleryItem label="VideoPlayer + every control (no source, no autoplay)">
          <VideoPlayer className="w-[640px] overflow-hidden rounded-surface">
            <VideoPlayerContent
              slot="media"
              poster={POSTER}
              preload="none"
              muted
              playsInline
              className="aspect-video w-full bg-black"
            />
            <VideoPlayerControlBar>
              <VideoPlayerPlayButton />
              <VideoPlayerSeekBackwardButton />
              <VideoPlayerSeekForwardButton />
              <VideoPlayerTimeRange />
              <VideoPlayerTimeDisplay showDuration />
              <VideoPlayerMuteButton />
              <VideoPlayerVolumeRange />
              <VideoPlayerPlaybackRateButton />
              <VideoPlayerFullscreenButton />
            </VideoPlayerControlBar>
          </VideoPlayer>
        </GalleryItem>
      </GalleryGroup>

      <GalleryGroup title="Cursor / AvatarStack / ThemeSwitcher">
        <GalleryItem label="Cursor / CursorPointer / CursorBody / CursorName">
          <div className="flex gap-10 p-2">
            <Cursor>
              <CursorPointer className="text-primary" />
              <CursorBody className="bg-primary text-primary-foreground">
                <CursorName>Ada</CursorName>
                <span>Reviewing tabs</span>
              </CursorBody>
            </Cursor>
            <Cursor>
              <CursorPointer className="text-success" />
              <CursorBody className="bg-success/10 text-success">
                <CursorName>Linus</CursorName>
              </CursorBody>
            </Cursor>
          </div>
        </GalleryItem>
        <GalleryItem label="AvatarStack (size 24, 32)">
          <div className="flex flex-col gap-3">
            <AvatarStack>
              {["AL", "GH", "MK", "TS"].map((initials) => (
                <Avatar className="size-full" key={initials}>
                  <AvatarFallback className="text-[10px]">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              ))}
            </AvatarStack>
            <AvatarStack size={32}>
              {["AL", "GH", "MK"].map((initials) => (
                <Avatar className="size-full" key={initials}>
                  <AvatarFallback className="text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              ))}
            </AvatarStack>
          </div>
        </GalleryItem>
        <GalleryItem label="ThemeSwitcher (value=dark, controlled)">
          {/* ThemeSwitcher renders `motion.*`, which throws under the app's
              `<LazyMotion strict>` (MotionProvider). A non-strict LazyMotion
              scope lets it render; the app itself does not use it yet. */}
          <LazyMotion features={domMax}>
            <div className="w-fit">
              <ThemeSwitcher value="dark" onChange={noop} />
            </div>
          </LazyMotion>
        </GalleryItem>
      </GalleryGroup>
    </>
  );
}
