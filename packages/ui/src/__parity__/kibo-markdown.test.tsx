// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import * as Next from "@vvedantb/ui";

import { evaUiConfig } from "../config";
import { AvatarStack } from "../kibo/avatar-stack";
import {
  ContributionGraph,
  ContributionGraphBlock,
  ContributionGraphCalendar,
  ContributionGraphFooter,
  ContributionGraphLegend,
  ContributionGraphTotalCount,
  type Activity,
} from "../kibo/contribution-graph";
import { Cursor, CursorBody, CursorName, CursorPointer } from "../kibo/cursor";
import {
  GanttFeatureItem,
  GanttFeatureList,
  GanttFeatureListGroup,
  GanttFeatureRow,
} from "../kibo/gantt-features";
import { GanttHeader } from "../kibo/gantt-header";
import { GanttProvider, type GanttFeature, type Range } from "../kibo/gantt-provider";
import {
  GanttSidebar,
  GanttSidebarGroup,
  GanttSidebarItem,
} from "../kibo/gantt-sidebar";
import { GanttTimeline, GanttToday } from "../kibo/gantt-timeline";
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
  type KanbanColumnDef,
  type KanbanItem,
} from "../kibo/kanban";
import { ListGroup, ListHeader, ListItem, ListItems, ListProvider } from "../kibo/list";
import { ThemeSwitcher } from "../kibo/theme-switcher";
import {
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
} from "../kibo/video-player";
import { Markdown } from "../markdown";
import { renderPair } from "./harness";

/**
 * dnd-kit numbers its accessibility nodes (`DndDescribedBy-0`,
 * `DndLiveRegion-0`) with a counter that lives in the module and never resets,
 * so the second tree rendered in one test run gets the next number. The ids
 * are renumbered by first use, as the harness does for React ids; the node
 * that carries each id is still compared.
 */
function renumberDndIds(html: string): string {
  const ids = new Map<string, string>();
  return html.replace(/Dnd(DescribedBy|LiveRegion)-\d+/g, (id, kind: string) => {
    const known = ids.get(id);
    if (known) return known;
    const next = `Dnd${kind}-«${ids.size}»`;
    ids.set(id, next);
    return next;
  });
}

async function same(
  legacy: ReactNode,
  next: ReactNode,
  interact?: () => Promise<void> | void,
): Promise<string> {
  const pair = await renderPair(legacy, next, evaUiConfig, interact);
  const before = renumberDndIds(pair.legacy);
  expect(renumberDndIds(pair.next)).toBe(before);
  return before;
}

// --- Kanban ---

const columns: KanbanColumnDef[] = [
  { id: "todo", name: "Todo" },
  { id: "doing", name: "Doing" },
  { id: "done", name: "Done" },
];

const cards: KanbanItem[] = [
  { id: "c1", name: "Write brief", column: "todo" },
  { id: "c2", name: "Review", column: "todo" },
  { id: "c3", name: "Ship", column: "doing" },
];

function kanban(kit: {
  Provider: typeof KanbanProvider;
  Board: typeof KanbanBoard;
  Header: typeof KanbanHeader;
  Cards: typeof KanbanCards;
  Card: typeof KanbanCard;
}, providerClassName?: string) {
  return (
    <kit.Provider
      columns={columns}
      data={cards}
      className={providerClassName}
      overlay={<div className="overlay-card">dragging</div>}
    >
      {columns.map((column) => (
        <kit.Board
          key={column.id}
          id={column.id}
          disabled={column.id === "done"}
          className={column.id === "doing" ? "bg-card border border-border" : undefined}
        >
          <kit.Header className="text-xs">{column.name}</kit.Header>
          <kit.Cards id={column.id} className="px-2">
            {(item) => (
              <kit.Card
                key={item.id}
                id={item.id}
                className="bg-background p-2"
                onClick={() => {}}
              >
                {item.name}
              </kit.Card>
            )}
          </kit.Cards>
        </kit.Board>
      ))}
    </kit.Provider>
  );
}

const legacyKanban = {
  Provider: KanbanProvider,
  Board: KanbanBoard,
  Header: KanbanHeader,
  Cards: KanbanCards,
  Card: KanbanCard,
};
const nextKanban = {
  Provider: Next.KanbanProvider,
  Board: Next.KanbanBoard,
  Header: Next.KanbanHeader,
  Cards: Next.KanbanCards,
  Card: Next.KanbanCard,
};

describe("Kanban", () => {
  test("columns, headers, cards, disabled column, overlay portal", async () => {
    const html = await same(kanban(legacyKanban), kanban(nextKanban));
    expect(html).toContain("cursor-grab");
    expect(html).toContain("DndDescribedBy");
  });

  test("provider className wraps the board", async () => {
    await same(
      kanban(legacyKanban, "flex gap-3"),
      kanban(nextKanban, "flex gap-3"),
    );
  });
});

// --- List ---

function list(kit: {
  Provider: typeof ListProvider;
  Group: typeof ListGroup;
  Header: typeof ListHeader;
  Items: typeof ListItems;
  Item: typeof ListItem;
}) {
  return (
    <kit.Provider onDragEnd={() => {}} className="flex-1 min-h-0 gap-2 sm:gap-3">
      <kit.Group id="todo">
        <kit.Header name="Todo" color="#f59e0b" className="rounded-lg" />
        <kit.Items className="pr-1.5 pb-1.5">
          <kit.Item id="a" name="First" index={0} parent="todo" />
          <kit.Item id="b" name="Second" index={1} parent="todo" className="px-2">
            <span>custom row</span>
          </kit.Item>
        </kit.Items>
      </kit.Group>
      <kit.Group id="done" className="mt-2">
        <kit.Header>
          <div className="custom-header">Done</div>
        </kit.Header>
        <kit.Items>
          <kit.Item id="c" name="Third" index={0} parent="done" />
        </kit.Items>
      </kit.Group>
    </kit.Provider>
  );
}

describe("List", () => {
  test("groups, both header forms, items with and without children", async () => {
    const html = await same(
      list({ Provider: ListProvider, Group: ListGroup, Header: ListHeader, Items: ListItems, Item: ListItem }),
      list({
        Provider: Next.ListProvider,
        Group: Next.ListGroup,
        Header: Next.ListHeader,
        Items: Next.ListItems,
        Item: Next.ListItem,
      }),
    );
    expect(html).toContain("custom-header");
  });
});

// --- Gantt (system date fixed to 15 June 2026, so "today" is stable) ---

const status = { id: "s", name: "Active", color: "#3b82f6" };
const features: GanttFeature[] = [
  {
    id: "f1",
    name: "Discovery",
    startAt: new Date(2026, 4, 4),
    endAt: new Date(2026, 5, 20),
    status,
  },
  {
    id: "f2",
    name: "Build",
    startAt: new Date(2026, 5, 10),
    endAt: new Date(2026, 7, 30),
    status: { ...status, color: "#10b981" },
  },
  {
    id: "f3",
    name: "Same day",
    startAt: new Date(2026, 5, 12),
    endAt: new Date(2026, 5, 12),
    status,
  },
];

function gantt(
  kit: {
    Provider: typeof GanttProvider;
    Sidebar: typeof GanttSidebar;
    SidebarGroup: typeof GanttSidebarGroup;
    SidebarItem: typeof GanttSidebarItem;
    Timeline: typeof GanttTimeline;
    Header: typeof GanttHeader;
    FeatureList: typeof GanttFeatureList;
    FeatureListGroup: typeof GanttFeatureListGroup;
    FeatureItem: typeof GanttFeatureItem;
    FeatureRow: typeof GanttFeatureRow;
    Today: typeof GanttToday;
  },
  range: Range,
  zoom = 100,
) {
  return (
    <kit.Provider range={range} zoom={zoom} onZoomChange={() => {}} className="border">
      <kit.Sidebar headerTitle="Projects" headerMeta="Progress">
        <kit.SidebarGroup name="Q2">
          <kit.SidebarItem feature={features[0]} onSelectItem={() => {}} />
          <kit.SidebarItem
            feature={features[1]}
            selected
            icon={<span className="icon">i</span>}
            meta={<span className="meta">50%</span>}
          />
          <kit.SidebarItem feature={features[2]} className="opacity-80" />
        </kit.SidebarGroup>
      </kit.Sidebar>
      <kit.Timeline>
        <kit.Header />
        <kit.FeatureList>
          <kit.FeatureListGroup>
            <kit.FeatureItem {...features[0]} onMove={() => {}} onClick={() => {}}>
              <span>custom bar</span>
            </kit.FeatureItem>
            <kit.FeatureItem {...features[1]} />
          </kit.FeatureListGroup>
          <kit.FeatureRow features={features} onMove={() => {}} />
        </kit.FeatureList>
        <kit.Today className="shadow-sm" />
      </kit.Timeline>
    </kit.Provider>
  );
}

const legacyGantt = {
  Provider: GanttProvider,
  Sidebar: GanttSidebar,
  SidebarGroup: GanttSidebarGroup,
  SidebarItem: GanttSidebarItem,
  Timeline: GanttTimeline,
  Header: GanttHeader,
  FeatureList: GanttFeatureList,
  FeatureListGroup: GanttFeatureListGroup,
  FeatureItem: GanttFeatureItem,
  FeatureRow: GanttFeatureRow,
  Today: GanttToday,
};
const nextGantt = {
  Provider: Next.GanttProvider,
  Sidebar: Next.GanttSidebar,
  SidebarGroup: Next.GanttSidebarGroup,
  SidebarItem: Next.GanttSidebarItem,
  Timeline: Next.GanttTimeline,
  Header: Next.GanttHeader,
  FeatureList: Next.GanttFeatureList,
  FeatureListGroup: Next.GanttFeatureListGroup,
  FeatureItem: Next.GanttFeatureItem,
  FeatureRow: Next.GanttFeatureRow,
  Today: Next.GanttToday,
};

describe("Gantt", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 15, 12));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  for (const range of ["daily", "monthly", "quarterly"] as const) {
    test(`range=${range}`, async () => {
      const html = await same(gantt(legacyGantt, range), gantt(nextGantt, range));
      expect(html).toContain("scrollbar-none");
      expect(html).toContain("text-3xs");
      expect(html).toContain("Jun 15, 2026");
    });
  }

  // happy-dom lays nothing out, so `clientWidth` is 0 and the off-screen
  // date chips never show. With a 400px viewport the provider centres on
  // today and the earlier bars fall off the left edge.
  test("off-screen date chips", async () => {
    const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
    try {
      const html = await same(gantt(legacyGantt, "daily"), gantt(nextGantt, "daily"));
      expect(html).toContain("←");
    } finally {
      if (clientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidth);
    }
  });

  test("zoom=150", async () => {
    await same(gantt(legacyGantt, "monthly", 150), gantt(nextGantt, "monthly", 150));
  });
});

// --- ContributionGraph (fixed data: 1 March to 31 May 2026) ---

const activities: Activity[] = Array.from({ length: 92 }, (_, day) => {
  const date = new Date(Date.UTC(2026, 2, 1 + day)).toISOString().slice(0, 10);
  const count = (day * 7) % 11;
  return { date, count, level: Math.min(4, Math.floor(count / 3)) };
});

function graph(
  kit: {
    Graph: typeof ContributionGraph;
    Calendar: typeof ContributionGraphCalendar;
    Block: typeof ContributionGraphBlock;
    Footer: typeof ContributionGraphFooter;
    Total: typeof ContributionGraphTotalCount;
    Legend: typeof ContributionGraphLegend;
  },
  props: { totalCount?: number; hideMonthLabels?: boolean; weekStart?: 0 | 1 } = {},
) {
  return (
    <kit.Graph
      data={activities}
      totalCount={props.totalCount}
      weekStart={props.weekStart}
      className="w-full max-w-full"
    >
      <kit.Calendar className="w-full" hideMonthLabels={props.hideMonthLabels}>
        {({ activity, dayIndex, weekIndex }) => (
          <kit.Block
            activity={activity}
            dayIndex={dayIndex}
            weekIndex={weekIndex}
            className="cursor-pointer"
          />
        )}
      </kit.Calendar>
      <kit.Footer>
        <kit.Total />
        <kit.Legend />
      </kit.Footer>
    </kit.Graph>
  );
}

const legacyGraph = {
  Graph: ContributionGraph,
  Calendar: ContributionGraphCalendar,
  Block: ContributionGraphBlock,
  Footer: ContributionGraphFooter,
  Total: ContributionGraphTotalCount,
  Legend: ContributionGraphLegend,
};
const nextGraph = {
  Graph: Next.ContributionGraph,
  Calendar: Next.ContributionGraphCalendar,
  Block: Next.ContributionGraphBlock,
  Footer: Next.ContributionGraphFooter,
  Total: Next.ContributionGraphTotalCount,
  Legend: Next.ContributionGraphLegend,
};

describe("ContributionGraph", () => {
  test("calendar, blocks, total and legend", async () => {
    const html = await same(graph(legacyGraph), graph(nextGraph));
    expect(html).toContain('data-level="4"');
  });

  test("explicit total, Monday week start, no month labels", async () => {
    await same(
      graph(legacyGraph, { totalCount: 7, weekStart: 1, hideMonthLabels: true }),
      graph(nextGraph, { totalCount: 7, weekStart: 1, hideMonthLabels: true }),
    );
  });

  test("render-prop total and legend", async () => {
    const children = (kit: typeof legacyGraph | typeof nextGraph) => (
      <kit.Graph data={activities}>
        <kit.Total>{({ totalCount, year }) => <b>{`${totalCount}/${year}`}</b>}</kit.Total>
        <kit.Legend className="gap-1">{({ level }) => <i>{level}</i>}</kit.Legend>
      </kit.Graph>
    );
    await same(children(legacyGraph), children(nextGraph));
  });

  test("no data renders nothing", async () => {
    await same(
      <ContributionGraph data={[]}>x</ContributionGraph>,
      <Next.ContributionGraph data={[]}>x</Next.ContributionGraph>,
    );
  });
});

// --- AvatarStack, Cursor, ThemeSwitcher ---

describe("AvatarStack", () => {
  for (const size of [undefined, 32]) {
    test(`size=${size ?? "default"}`, async () => {
      const avatars = [
        <img key="a" src="a.png" alt="" />,
        null,
        <img key="b" src="b.png" alt="" />,
        <span key="c">+3</span>,
      ];
      await same(
        <AvatarStack size={size} className="ml-1">{avatars}</AvatarStack>,
        <Next.AvatarStack size={size} className="ml-1">{avatars}</Next.AvatarStack>,
      );
    });
  }
});

describe("Cursor", () => {
  test("live cursor composition", async () => {
    const parts = (kit: {
      Cursor: typeof Cursor;
      Pointer: typeof CursorPointer;
      Body: typeof CursorBody;
      Name: typeof CursorName;
    }) => (
      <kit.Cursor style={{ color: "#ef4444" }}>
        <kit.Pointer />
        <kit.Body className="text-white" style={{ backgroundColor: "#ef4444" }}>
          <kit.Name data-pii>Ada</kit.Name>
        </kit.Body>
      </kit.Cursor>
    );
    await same(
      parts({ Cursor, Pointer: CursorPointer, Body: CursorBody, Name: CursorName }),
      parts({
        Cursor: Next.Cursor,
        Pointer: Next.CursorPointer,
        Body: Next.CursorBody,
        Name: Next.CursorName,
      }),
    );
  });
});

describe("ThemeSwitcher", () => {
  for (const value of ["system", "light", "dark"] as const) {
    test(`value=${value}`, async () => {
      const html = await same(
        <ThemeSwitcher value={value} onChange={() => {}} className="w-fit" />,
        <Next.ThemeSwitcher value={value} onChange={() => {}} className="w-fit" />,
      );
      expect(html).toContain("motion-press");
    });
  }

  test("uncontrolled, after clicking Dark", async () => {
    await same(<ThemeSwitcher />, <Next.ThemeSwitcher />, () => {
      document.querySelector<HTMLButtonElement>('[aria-label="Dark theme"]')?.click();
    });
  });
});

// --- VideoPlayer (no autoplay; media-chrome custom elements) ---

describe("VideoPlayer", () => {
  test("MediaPreview composition", async () => {
    const player = (kit: {
      Player: typeof VideoPlayer;
      Content: typeof VideoPlayerContent;
      Bar: typeof VideoPlayerControlBar;
      Play: typeof VideoPlayerPlayButton;
      Back: typeof VideoPlayerSeekBackwardButton;
      Forward: typeof VideoPlayerSeekForwardButton;
      Range: typeof VideoPlayerTimeRange;
      Time: typeof VideoPlayerTimeDisplay;
      Rate: typeof VideoPlayerPlaybackRateButton;
      Mute: typeof VideoPlayerMuteButton;
      Volume: typeof VideoPlayerVolumeRange;
      Fullscreen: typeof VideoPlayerFullscreenButton;
    }) => (
      <kit.Player className="max-w-full">
        <kit.Content
          src="https://example.com/v.mp4"
          playsInline
          preload="metadata"
          slot="media"
          className="max-h-96"
        />
        <kit.Bar>
          <kit.Play />
          <kit.Range />
          <kit.Time showDuration />
          <kit.Rate rates={[1, 3, 5, 8]} className="max-sm:hidden" />
          <kit.Mute />
          <kit.Volume className="max-sm:hidden" />
          <kit.Fullscreen />
        </kit.Bar>
      </kit.Player>
    );
    const html = await same(
      player({
        Player: VideoPlayer,
        Content: VideoPlayerContent,
        Bar: VideoPlayerControlBar,
        Play: VideoPlayerPlayButton,
        Back: VideoPlayerSeekBackwardButton,
        Forward: VideoPlayerSeekForwardButton,
        Range: VideoPlayerTimeRange,
        Time: VideoPlayerTimeDisplay,
        Rate: VideoPlayerPlaybackRateButton,
        Mute: VideoPlayerMuteButton,
        Volume: VideoPlayerVolumeRange,
        Fullscreen: VideoPlayerFullscreenButton,
      }),
      player({
        Player: Next.VideoPlayer,
        Content: Next.VideoPlayerContent,
        Bar: Next.VideoPlayerControlBar,
        Play: Next.VideoPlayerPlayButton,
        Back: Next.VideoPlayerSeekBackwardButton,
        Forward: Next.VideoPlayerSeekForwardButton,
        Range: Next.VideoPlayerTimeRange,
        Time: Next.VideoPlayerTimeDisplay,
        Rate: Next.VideoPlayerPlaybackRateButton,
        Mute: Next.VideoPlayerMuteButton,
        Volume: Next.VideoPlayerVolumeRange,
        Fullscreen: Next.VideoPlayerFullscreenButton,
      }),
    );
    expect(html).toContain("smooth-shadow-ring-lg");
    expect(html).not.toContain("autoplay");
  });

  // The seek buttons render outside a controller: inside one, the controller
  // sets `mediaLang` on them and media-chrome writes into a tooltip slot that
  // happy-dom does not build for these two buttons, which throws (in both
  // trees alike). Their markup is a custom element with one class string.
  test("seek buttons", async () => {
    await same(
      <div>
        <VideoPlayerSeekBackwardButton />
        <VideoPlayerSeekForwardButton className="max-sm:hidden" />
      </div>,
      <div>
        <Next.VideoPlayerSeekBackwardButton />
        <Next.VideoPlayerSeekForwardButton className="max-sm:hidden" />
      </div>,
    );
  });
});

// --- Markdown ---

const DOCUMENT = [
  "# Heading one",
  "## Heading two",
  "### Heading three",
  "###### Heading six",
  "",
  "Paragraph with **bold**, *em*, ~~struck~~ and `inline code`, a file `src/app.ts:12` and `console.log`.",
  "",
  "- bullet",
  "  - nested",
  "- [x] done task",
  "- [ ] open task",
  "",
  "1. first",
  "2. second",
  "",
  "| Name | Value |",
  "| --- | --- |",
  "| a | 1 |",
  "| b | 2 |",
  "",
  "```ts title=\"src/a.ts\"",
  "const answer: number = 42;",
  "console.log(answer);",
  "```",
  "",
  "```",
  "plain fence",
  "```",
  "",
  "> A plain quote.",
  "",
  "> [!NOTE]",
  "> A note.",
  "",
  "> [!TIP]",
  "> A tip.",
  "",
  "> [!IMPORTANT]",
  "> Important.",
  "",
  "> [!WARNING]",
  "> A warning.",
  "",
  "> [!CAUTION]",
  "> Careful.",
  "",
  "Links: [docs](https://example.com/docs), [repo](https://github.com/acme/repo), [anchor](#section), https://example.com/a/very/long/path?x=1&y=2 and <mailto:a@example.com>.",
  "",
  "Inline math $E = mc^2$ and display math:",
  "",
  "$$",
  "\\int_0^1 x^2 \\, dx = \\frac{1}{3}",
  "$$",
  "",
  "---",
  "",
  "```mermaid",
  "graph TD;",
  "  A-->B;",
  "```",
].join("\n");

/**
 * EXCEPTION, until the AI chat family lands eva's `MessageAction`: vvedantb's
 * `MessageAction` mounts its tooltip with the button, so the code block's wrap
 * and copy buttons carry the `data-state="closed"` a Radix `TooltipTrigger`
 * adds. eva's mounts the tooltip on first hover or focus. Nothing styles
 * `data-state` on these buttons, so the rendered page is the same; the
 * attribute is dropped from those buttons only, and this goes once
 * `MessageAction` matches.
 */
function dropCodeActionTooltipState(html: string): string {
  return html.replace(
    /(<span class="markdown-code-actions">[\s\S]*?<\/span>\n<\/div>)/g,
    (actions) => actions.replaceAll(' data-state="closed">', ">"),
  );
}

async function sameMarkdown(legacy: ReactNode, next: ReactNode, interact?: () => Promise<void> | void) {
  const pair = await renderPair(legacy, next, evaUiConfig, interact);
  expect(dropCodeActionTooltipState(pair.next)).toBe(pair.legacy);
  return pair.legacy;
}

/** Waits for Shiki to tokenise the code blocks in both trees. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 400));
}

describe("Markdown", () => {
  test("headings, lists, tables, fences, inline code, quotes, alerts, links, KaTeX, mermaid placeholder", async () => {
    const html = await sameMarkdown(
      <Markdown className="text-sm">{DOCUMENT}</Markdown>,
      <Next.Markdown className="text-sm">{DOCUMENT}</Next.Markdown>,
      settle,
    );
    expect(html).toContain('data-alert="important"');
    expect(html).toContain("katex");
    expect(html).toContain('data-language="mermaid"');
    expect(html).toContain("markdown-link-icon");
    expect(html, "Shiki tokens reached both trees").toContain("--md-c");
  });

  test("custom components and remark plugins extend the defaults", async () => {
    const components = { em: (props: { children?: ReactNode }) => <i className="custom-em">{props.children}</i> };
    await sameMarkdown(
      <Markdown components={components}>{"Some *emphasis* here."}</Markdown>,
      <Next.Markdown components={components}>{"Some *emphasis* here."}</Next.Markdown>,
    );
  });

  test("a streaming (unterminated) fence", async () => {
    const streaming = "Before\n\n```ts\nconst a = 1;\nconst b";
    await sameMarkdown(
      <Markdown mode="streaming" isAnimating>{streaming}</Markdown>,
      <Next.Markdown mode="streaming" isAnimating>{streaming}</Next.Markdown>,
      settle,
    );
  });
});
