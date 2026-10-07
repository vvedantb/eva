"use client";

import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  type Range,
} from "@eva/ui";
import {
  IconZoomIn,
  IconZoomOut,
  IconCalendarEvent,
} from "@tabler/icons-react";

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "quarterly", label: "Quarter" },
  { value: "monthly", label: "Month" },
  { value: "daily", label: "Week" },
];

function isRange(value: string): value is Range {
  return value === "quarterly" || value === "monthly" || value === "daily";
}

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 25;

interface TimelineToolbarProps {
  range: Range;
  zoom: number;
  onRangeChange: (range: Range) => void;
  onZoomChange: (zoom: number) => void;
  onToday: () => void;
}

/** Linear-style controls above the roadmap: jump-to-today, axis granularity,
 *  and zoom. State is owned by the parent (persisted in project filters). */
export function TimelineToolbar({
  range,
  zoom,
  onRangeChange,
  onZoomChange,
  onToday,
}: TimelineToolbarProps) {
  return (
    <div className="flex max-sm:flex-wrap items-center justify-end gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Jump to today"
            className="h-8 gap-1.5"
            onClick={onToday}
          >
            <IconCalendarEvent size={15} aria-hidden />
            <span className="hidden sm:inline">Today</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Jump to today</TooltipContent>
      </Tooltip>

      <Tabs
        value={range}
        onValueChange={(value) => {
          if (isRange(value)) onRangeChange(value);
        }}
      >
        <TabsList className="tabs-segmented h-8 max-sm:h-10">
          {RANGE_OPTIONS.map((opt) => (
            <TabsTrigger
              key={opt.value}
              value={opt.value}
              className="px-3 py-1 text-xs"
            >
              {opt.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex items-center overflow-hidden rounded-surface bg-muted/40">
        {/* Real 40px below `sm` rather than `hit-target`: these two abut, so an
            8px pseudo-element bleed would eat into the neighbour, and the
            group's `overflow-hidden` would clip it anyway. */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom out"
          className="size-10 rounded-none sm:size-8"
          disabled={zoom <= ZOOM_MIN}
          onClick={() => onZoomChange(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
        >
          <IconZoomOut size={15} aria-hidden />
        </Button>
        <span className="w-10 text-center text-2xs tabular-nums text-muted-foreground">
          {zoom}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom in"
          className="size-10 rounded-none sm:size-8"
          disabled={zoom >= ZOOM_MAX}
          onClick={() => onZoomChange(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
        >
          <IconZoomIn size={15} aria-hidden />
        </Button>
      </div>
    </div>
  );
}
