"use client";

import dayjs from "../utils/dayjs";
import type { CSSProperties, FC, ReactNode, RefObject } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../utils/cn";

function throttle(fn: () => void, ms: number): () => void {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      if (timer) clearTimeout(timer);
      last = now;
      fn();
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn();
      }, remaining);
    }
  };
}

export type GanttStatus = {
  id: string;
  name: string;
  color: string;
};

export type GanttFeature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: GanttStatus;
  lane?: string;
};

export type GanttMarkerProps = {
  id: string;
  date: Date;
  label: string;
};

export type Range = "daily" | "monthly" | "quarterly";

export type TimelineData = {
  year: number;
  quarters: {
    months: {
      days: number;
    }[];
  }[];
}[];

export type GanttContextProps = {
  zoom: number;
  range: Range;
  columnWidth: number;
  sidebarWidth: number;
  headerHeight: number;
  rowHeight: number;
  onAddItem: ((date: Date) => void) | undefined;
  placeholderLength: number;
  timelineData: TimelineData;
  ref: RefObject<HTMLDivElement | null> | null;
  scrollToFeature?: (feature: GanttFeature) => void;
  scrollToToday?: () => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  scrollX: number;
  setScrollX: (v: number) => void;
};

/** The issue-list column at desktop width. */
const GANTT_SIDEBAR_WIDTH_PX = 300;

/**
 * The sidebar is a grid track, not a sized element, so its width has to be a
 * number. Hardcoded at 300 it left roughly 90px of chart canvas on a 390px
 * phone — the timeline was there, just not wide enough to read. Capped at 45% of
 * the viewport, a phone keeps the majority of the width for the bars while
 * desktop is unchanged.
 */
function ganttSidebarWidth(): number {
  return Math.min(
    GANTT_SIDEBAR_WIDTH_PX,
    Math.round(window.innerWidth * 0.45),
  );
}

export const GanttContext = createContext<GanttContextProps>({
  zoom: 100,
  range: "monthly",
  columnWidth: 50,
  headerHeight: 60,
  sidebarWidth: GANTT_SIDEBAR_WIDTH_PX,
  rowHeight: 36,
  onAddItem: undefined,
  placeholderLength: 2,
  timelineData: [],
  ref: null,
  scrollToFeature: undefined,
  scrollToToday: undefined,
  dragging: false,
  setDragging: () => {},
  scrollX: 0,
  setScrollX: () => {},
});

export const useGanttContext = () => useContext(GanttContext);

export const getDifferenceIn = (range: Range) => {
  if (range === "monthly" || range === "quarterly") {
    return (a: Date, b: Date) => dayjs(a).diff(dayjs(b), "month");
  }
  return (a: Date, b: Date) => dayjs(a).diff(dayjs(b), "day");
};

const getInnerDifferenceIn = (range: Range) => {
  if (range === "monthly" || range === "quarterly") {
    return (a: Date, b: Date) => dayjs(a).diff(dayjs(b), "day");
  }
  return (a: Date, b: Date) => dayjs(a).diff(dayjs(b), "hour");
};

const getStartOf = (range: Range) => {
  if (range === "monthly" || range === "quarterly") {
    return (date: Date) => dayjs(date).startOf("month").toDate();
  }
  return (date: Date) => dayjs(date).startOf("day").toDate();
};

const getEndOf = (range: Range) => {
  if (range === "monthly" || range === "quarterly") {
    return (date: Date) => dayjs(date).endOf("month").toDate();
  }
  return (date: Date) => dayjs(date).endOf("day").toDate();
};

export const getAddRange = (range: Range) => {
  if (range === "monthly" || range === "quarterly") {
    return (date: Date, n: number) => dayjs(date).add(n, "month").toDate();
  }
  return (date: Date, n: number) => dayjs(date).add(n, "day").toDate();
};

const createInitialTimelineData = (today: Date) => {
  const data: TimelineData = [];
  const currentYear = today.getFullYear();

  for (let y = currentYear - 1; y <= currentYear + 1; y++) {
    const yearObj: TimelineData[number] = { year: y, quarters: [] };
    for (let q = 0; q < 4; q++) {
      const months = [];
      for (let m = 0; m < 3; m++) {
        const month = q * 3 + m;
        months.push({ days: dayjs(new Date(y, month, 1)).daysInMonth() });
      }
      yearObj.quarters.push({ months });
    }
    data.push(yearObj);
  }

  return data;
};

export const getOffset = (
  date: Date,
  timelineStartDate: Date,
  context: GanttContextProps,
) => {
  const parsedColumnWidth = (context.columnWidth * context.zoom) / 100;
  const differenceIn = getDifferenceIn(context.range);
  const startOf = getStartOf(context.range);
  const fullColumns = differenceIn(startOf(date), timelineStartDate);

  if (context.range === "daily") {
    return parsedColumnWidth * fullColumns;
  }

  const partialColumns = dayjs(date).date();
  const daysInMonth = dayjs(date).daysInMonth();
  const pixelsPerDay = parsedColumnWidth / daysInMonth;

  return fullColumns * parsedColumnWidth + partialColumns * pixelsPerDay;
};

export const getWidth = (
  startAt: Date,
  endAt: Date | null,
  context: GanttContextProps,
) => {
  const parsedColumnWidth = (context.columnWidth * context.zoom) / 100;

  if (!endAt) {
    return parsedColumnWidth * 2;
  }

  const differenceIn = getDifferenceIn(context.range);

  if (context.range === "daily") {
    const delta = differenceIn(endAt, startAt);
    return parsedColumnWidth * (delta || 1);
  }

  const daysInStartMonth = dayjs(startAt).daysInMonth();
  const pixelsPerDayInStartMonth = parsedColumnWidth / daysInStartMonth;

  if (dayjs(startAt).isSame(dayjs(endAt), "day")) {
    return pixelsPerDayInStartMonth;
  }

  const innerDifferenceIn = getInnerDifferenceIn(context.range);
  const startOf = getStartOf(context.range);

  if (dayjs(startOf(startAt)).isSame(dayjs(startOf(endAt)), "day")) {
    return innerDifferenceIn(endAt, startAt) * pixelsPerDayInStartMonth;
  }

  const startRangeOffset = daysInStartMonth - dayjs(startAt).date();
  const endRangeOffset = dayjs(endAt).date();
  const fullRangeOffset = differenceIn(startOf(endAt), startOf(startAt));
  const daysInEndMonth = dayjs(endAt).daysInMonth();
  const pixelsPerDayInEndMonth = parsedColumnWidth / daysInEndMonth;

  return (
    (fullRangeOffset - 1) * parsedColumnWidth +
    startRangeOffset * pixelsPerDayInStartMonth +
    endRangeOffset * pixelsPerDayInEndMonth
  );
};

export const calculateInnerOffset = (
  date: Date,
  range: Range,
  columnWidth: number,
) => {
  const startOf = getStartOf(range);
  const endOf = getEndOf(range);
  const differenceIn = getInnerDifferenceIn(range);
  const startOfRange = startOf(date);
  const endOfRange = endOf(date);
  const totalRangeDays = differenceIn(endOfRange, startOfRange);
  const dayOfMonth = dayjs(date).date();

  return (dayOfMonth / totalRangeDays) * columnWidth;
};

export type GanttProviderProps = {
  range?: Range;
  zoom?: number;
  onAddItem?: (date: Date) => void;
  onZoomChange?: (zoom: number) => void;
  children: ReactNode;
  className?: string;
};

export const GanttProvider: FC<GanttProviderProps> = ({
  zoom = 100,
  range = "monthly",
  onAddItem,
  onZoomChange,
  children,
  className,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [timelineData, setTimelineData] = useState<TimelineData>(
    createInitialTimelineData(new Date()),
  );
  const [scrollX, setScrollX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(0);

  const headerHeight = 60;
  const rowHeight = 36;
  // Daily is rendered as a Linear-style weekly grid (~16px/day → ~112px/week),
  // so the per-day column is narrow and only week starts are labelled.
  let columnWidth = 16;

  if (range === "monthly") {
    columnWidth = 150;
  } else if (range === "quarterly") {
    columnWidth = 100;
  }

  const cssVariables = useMemo((): CSSProperties => {
    const vars: Record<string, string> = {
      "--gantt-zoom": `${zoom}`,
      "--gantt-column-width": `${(zoom / 100) * columnWidth}px`,
      "--gantt-header-height": `${headerHeight}px`,
      "--gantt-row-height": `${rowHeight}px`,
      "--gantt-sidebar-width": `${sidebarWidth}px`,
    };
    return vars;
  }, [zoom, columnWidth, sidebarWidth]);

  // Center the canvas on today once the sidebar width is known, matching
  // Linear's default (today near the middle of the viewport). Runs once.
  const didCenterRef = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || didCenterRef.current || sidebarWidth === 0) return;
    const firstYear = timelineData[0]?.year ?? new Date().getFullYear();
    const offset = getOffset(new Date(), new Date(firstYear, 0, 1), {
      zoom,
      range,
      columnWidth,
      sidebarWidth,
      headerHeight,
      rowHeight,
      onAddItem,
      placeholderLength: 2,
      timelineData,
      ref: scrollRef,
      dragging: false,
      setDragging: () => {},
      scrollX: 0,
      setScrollX: () => {},
    });
    el.scrollLeft = Math.max(0, sidebarWidth + offset - el.clientWidth / 2);
    setScrollX(el.scrollLeft);
    didCenterRef.current = true;
  }, [sidebarWidth, zoom, range, columnWidth, timelineData, onAddItem]);

  // Ctrl/Cmd + wheel (and trackpad pinch, which sends ctrlKey) zooms the
  // timeline like Linear, instead of zooming the page. Plain wheel scrolls.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onZoomChange) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const next = Math.min(
        200,
        Math.max(50, zoomRef.current + direction * 10),
      );
      if (next !== zoomRef.current) {
        zoomRef.current = next;
        onZoomChange(next);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoomChange]);

  useEffect(() => {
    const updateSidebarWidth = () => {
      const sidebarElement = scrollRef.current?.querySelector(
        '[data-roadmap-ui="gantt-sidebar"]',
      );
      setSidebarWidth(sidebarElement ? ganttSidebarWidth() : 0);
    };

    updateSidebarWidth();

    const observer = new MutationObserver(updateSidebarWidth);
    const el = scrollRef.current;
    if (el) {
      observer.observe(el, { childList: true, subtree: true });
    }

    // The width is viewport-relative below the full 300px, so it has to be
    // recomputed on resize and rotation — this number is also the scroll maths'
    // origin, so letting it drift from the rendered track mis-centres the chart.
    window.addEventListener("resize", updateSidebarWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSidebarWidth);
    };
  }, []);

  const handleScroll = useMemo(
    () =>
      throttle(() => {
        const scrollElement = scrollRef.current;
        if (!scrollElement) return;

        const { scrollLeft, scrollWidth, clientWidth } = scrollElement;
        setScrollX(scrollLeft);

        if (scrollLeft === 0) {
          const firstYear = timelineData[0]?.year;
          if (!firstYear) return;

          const newData: TimelineData = [...timelineData];
          const yearObj: TimelineData[number] = {
            year: firstYear - 1,
            quarters: [],
          };
          for (let q = 0; q < 4; q++) {
            const months = [];
            for (let m = 0; m < 3; m++) {
              const month = q * 3 + m;
              months.push({
                days: dayjs(new Date(firstYear - 1, month, 1)).daysInMonth(),
              });
            }
            yearObj.quarters.push({ months });
          }
          newData.unshift(yearObj);
          setTimelineData(newData);

          scrollElement.scrollLeft = scrollElement.clientWidth;
          setScrollX(scrollElement.scrollLeft);
        } else if (scrollLeft + clientWidth >= scrollWidth) {
          const lastYear = timelineData.at(-1)?.year;
          if (!lastYear) return;

          const newData: TimelineData = [...timelineData];
          const yearObj: TimelineData[number] = {
            year: lastYear + 1,
            quarters: [],
          };
          for (let q = 0; q < 4; q++) {
            const months = [];
            for (let m = 0; m < 3; m++) {
              const month = q * 3 + m;
              months.push({
                days: dayjs(new Date(lastYear + 1, month, 1)).daysInMonth(),
              });
            }
            yearObj.quarters.push({ months });
          }
          newData.push(yearObj);
          setTimelineData(newData);

          scrollElement.scrollLeft =
            scrollElement.scrollWidth - scrollElement.clientWidth;
          setScrollX(scrollElement.scrollLeft);
        }
      }, 100),
    [timelineData],
  );

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener("scroll", handleScroll);
    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Drag-to-pan: with the scrollbar hidden, pressing on empty canvas and
  // dragging scrolls the timeline like Linear's roadmap. Bars, the sidebar and
  // any interactive control opt out via the selector below so their own
  // click/drag behaviour is preserved.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let panning = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const isInteractive = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(
        target.closest(
          'button, a, input, textarea, select, [role="button"], [data-gantt-no-pan], [data-roadmap-ui="gantt-sidebar"]',
        ),
      );

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isInteractive(event.target)) return;
      panning = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = el.scrollLeft;
      startTop = el.scrollTop;
      el.style.cursor = "grabbing";
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!panning) return;
      el.scrollLeft = startLeft - (event.clientX - startX);
      el.scrollTop = startTop - (event.clientY - startY);
    };

    const endPan = () => {
      if (!panning) return;
      panning = false;
      el.style.cursor = "";
    };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endPan);
      window.removeEventListener("pointercancel", endPan);
    };
  }, []);

  const scrollToFeature = useCallback(
    (feature: GanttFeature) => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) return;

      const firstYear = timelineData[0]?.year ?? new Date().getFullYear();
      const timelineStartDate = new Date(firstYear, 0, 1);

      const offset = getOffset(feature.startAt, timelineStartDate, {
        zoom,
        range,
        columnWidth,
        sidebarWidth,
        headerHeight,
        rowHeight,
        onAddItem,
        placeholderLength: 2,
        timelineData,
        ref: scrollRef,
        dragging: false,
        setDragging: () => {},
        scrollX: 0,
        setScrollX: () => {},
      });

      scrollElement.scrollTo({ left: Math.max(0, offset), behavior: "smooth" });
    },
    [timelineData, zoom, range, columnWidth, sidebarWidth, onAddItem],
  );

  const scrollToToday = useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const firstYear = timelineData[0]?.year ?? new Date().getFullYear();
    const timelineStartDate = new Date(firstYear, 0, 1);

    const offset = getOffset(new Date(), timelineStartDate, {
      zoom,
      range,
      columnWidth,
      sidebarWidth,
      headerHeight,
      rowHeight,
      onAddItem,
      placeholderLength: 2,
      timelineData,
      ref: scrollRef,
      dragging: false,
      setDragging: () => {},
      scrollX: 0,
      setScrollX: () => {},
    });

    // Centre today in the viewport rather than pinning it to the left edge.
    scrollElement.scrollTo({
      left: Math.max(0, offset - scrollElement.clientWidth / 2),
      behavior: "smooth",
    });
  }, [timelineData, zoom, range, columnWidth, sidebarWidth, onAddItem]);

  return (
    <GanttContext.Provider
      value={{
        zoom,
        range,
        headerHeight,
        columnWidth,
        sidebarWidth,
        rowHeight,
        onAddItem,
        timelineData,
        placeholderLength: 2,
        ref: scrollRef,
        scrollToFeature,
        scrollToToday,
        dragging,
        setDragging,
        scrollX,
        setScrollX,
      }}
    >
      <div
        className={cn(
          "gantt relative isolate grid h-full w-full flex-none select-none overflow-auto scrollbar-none rounded-surface bg-card",
          range,
          className,
        )}
        ref={scrollRef}
        style={{
          ...cssVariables,
          gridTemplateColumns: "var(--gantt-sidebar-width) 1fr",
        }}
      >
        {children}
      </div>
    </GanttContext.Provider>
  );
};
