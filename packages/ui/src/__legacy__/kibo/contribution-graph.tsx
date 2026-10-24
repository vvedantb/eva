"use client";

import dayjs from "../utils/dayjs";
import {
  type CSSProperties,
  createContext,
  Fragment,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import { cn } from "../utils/cn";

export type Activity = {
  date: string;
  count: number;
  level: number;
};

type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type Week = Array<Activity | undefined>;

export type Labels = {
  months?: string[];
  weekdays?: string[];
  totalCount?: string;
  legend?: {
    less?: string;
    more?: string;
  };
};

type MonthLabel = {
  weekIndex: number;
  label: string;
};

const DEFAULT_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DEFAULT_LABELS: Labels = {
  months: DEFAULT_MONTH_LABELS,
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  totalCount: "{{count}} activities in {{year}}",
  legend: {
    less: "Less",
    more: "More",
  },
};

type ContributionGraphContextType = {
  data: Activity[];
  weeks: Week[];
  blockMargin: number;
  blockRadius: number;
  blockSize: number;
  fontSize: number;
  labels: Labels;
  labelHeight: number;
  maxLevel: number;
  totalCount: number;
  weekStart: WeekDay;
  year: number;
  width: number;
  height: number;
};

const ContributionGraphContext =
  createContext<ContributionGraphContextType | null>(null);

const useContributionGraph = () => {
  const context = useContext(ContributionGraphContext);

  if (!context) {
    throw new Error(
      "ContributionGraph components must be used within a ContributionGraph",
    );
  }

  return context;
};

type Dayjs = ReturnType<typeof dayjs>;

const eachDayOfInterval = (start: Dayjs, end: Dayjs): Dayjs[] => {
  const days: Dayjs[] = [];
  let current = start.startOf("day");
  const endDay = end.startOf("day");
  while (current.isBefore(endDay) || current.isSame(endDay, "day")) {
    days.push(current);
    current = current.add(1, "day");
  }
  return days;
};

const fillHoles = (activities: Activity[]): Activity[] => {
  if (activities.length === 0) {
    return [];
  }

  const sortedActivities = [...activities].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const calendar = new Map<string, Activity>(
    activities.map((a) => [a.date, a]),
  );

  const firstActivity = sortedActivities[0];
  const lastActivity = sortedActivities.at(-1);

  if (!firstActivity || !lastActivity) {
    return [];
  }

  return eachDayOfInterval(
    dayjs(firstActivity.date),
    dayjs(lastActivity.date),
  ).map((day) => {
    const date = day.format("YYYY-MM-DD");

    const existing = calendar.get(date);
    if (existing) {
      return existing;
    }

    return {
      date,
      count: 0,
      level: 0,
    };
  });
};

const nextDayOfWeek = (date: Dayjs, targetDay: WeekDay): Dayjs => {
  const currentDay = date.day();
  const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
  return date.add(daysUntil, "day");
};

const groupByWeeks = (
  activities: Activity[],
  weekStart: WeekDay = 0,
): Week[] => {
  if (activities.length === 0) {
    return [];
  }

  const normalizedActivities = fillHoles(activities);
  const firstActivity = normalizedActivities[0];
  if (!firstActivity) {
    return [];
  }

  const firstDate = dayjs(firstActivity.date);
  const firstCalendarDate =
    firstDate.day() === weekStart
      ? firstDate
      : nextDayOfWeek(firstDate, weekStart).subtract(1, "week");

  const paddingDays = firstDate.diff(firstCalendarDate, "day");
  const paddedActivities: Array<Activity | undefined> = [
    ...Array.from<undefined>({ length: paddingDays }),
    ...normalizedActivities,
  ];

  const numberOfWeeks = Math.ceil(paddedActivities.length / 7);

  return Array.from({ length: numberOfWeeks }, (_, weekIndex) =>
    paddedActivities.slice(weekIndex * 7, weekIndex * 7 + 7),
  );
};

const getMonthLabels = (
  weeks: Week[],
  monthNames: string[] = DEFAULT_MONTH_LABELS,
): MonthLabel[] => {
  return weeks
    .reduce<MonthLabel[]>((labels, week, weekIndex) => {
      const firstActivity = week.find((activity) => activity !== undefined);

      if (!firstActivity) {
        throw new Error(
          `Unexpected error: Week ${weekIndex + 1} is empty: [${week}].`,
        );
      }

      const month = monthNames[dayjs(firstActivity.date).month()];

      if (!month) {
        const monthName = dayjs(firstActivity.date).format("MMM");
        throw new Error(
          `Unexpected error: undefined month label for ${monthName}.`,
        );
      }

      const prevLabel = labels.at(-1);

      if (weekIndex === 0 || !prevLabel || prevLabel.label !== month) {
        return labels.concat({ weekIndex, label: month });
      }

      return labels;
    }, [])
    .filter(({ weekIndex }, index, labels) => {
      const minWeeks = 3;

      if (index === 0) {
        return labels[1] && labels[1].weekIndex - weekIndex >= minWeeks;
      }

      if (index === labels.length - 1) {
        return weeks.slice(weekIndex).length >= minWeeks;
      }

      return true;
    });
};

export type ContributionGraphProps = HTMLAttributes<HTMLDivElement> & {
  data: Activity[];
  blockMargin?: number;
  blockRadius?: number;
  blockSize?: number;
  fontSize?: number;
  labels?: Labels;
  maxLevel?: number;
  style?: CSSProperties;
  totalCount?: number;
  weekStart?: WeekDay;
  children: ReactNode;
  className?: string;
};

export const ContributionGraph = ({
  data,
  blockMargin = 4,
  blockRadius = 2,
  blockSize = 12,
  fontSize = 14,
  labels: labelsProp = undefined,
  maxLevel: maxLevelProp = 4,
  style = {},
  totalCount: totalCountProp = undefined,
  weekStart = 0,
  className,
  children,
  ...props
}: ContributionGraphProps) => {
  const maxLevel = Math.max(1, maxLevelProp);
  const weeks = useMemo(() => groupByWeeks(data, weekStart), [data, weekStart]);
  const LABEL_MARGIN = 8;

  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const labelHeight = fontSize + LABEL_MARGIN;

  const year =
    data.length > 0 ? dayjs(data[0].date).year() : new Date().getFullYear();

  const totalCount =
    typeof totalCountProp === "number"
      ? totalCountProp
      : data.reduce((sum, activity) => sum + activity.count, 0);

  const width = weeks.length * (blockSize + blockMargin) - blockMargin;
  const height = labelHeight + (blockSize + blockMargin) * 7 - blockMargin;

  if (data.length === 0) {
    return null;
  }

  return (
    <ContributionGraphContext.Provider
      value={{
        data,
        weeks,
        blockMargin,
        blockRadius,
        blockSize,
        fontSize,
        labels,
        labelHeight,
        maxLevel,
        totalCount,
        weekStart,
        year,
        width,
        height,
      }}
    >
      <div
        className={cn("flex w-max max-w-full flex-col gap-2", className)}
        style={{ fontSize, ...style }}
        {...props}
      >
        {children}
      </div>
    </ContributionGraphContext.Provider>
  );
};

export type ContributionGraphBlockProps = HTMLAttributes<SVGRectElement> & {
  activity: Activity;
  dayIndex: number;
  weekIndex: number;
};

export const ContributionGraphBlock = ({
  activity,
  dayIndex,
  weekIndex,
  className,
  ...props
}: ContributionGraphBlockProps) => {
  const { blockSize, blockMargin, blockRadius, labelHeight, maxLevel } =
    useContributionGraph();

  if (activity.level < 0 || activity.level > maxLevel) {
    throw new RangeError(
      `Provided activity level ${activity.level} for ${activity.date} is out of range. It must be between 0 and ${maxLevel}.`,
    );
  }

  return (
    <rect
      className={cn(
        'data-[level="0"]:fill-muted',
        'data-[level="1"]:fill-primary/20',
        'data-[level="2"]:fill-primary/40',
        'data-[level="3"]:fill-primary/60',
        'data-[level="4"]:fill-primary/80',
        className,
      )}
      data-count={activity.count}
      data-date={activity.date}
      data-level={activity.level}
      height={blockSize}
      rx={blockRadius}
      ry={blockRadius}
      width={blockSize}
      x={(blockSize + blockMargin) * weekIndex}
      y={labelHeight + (blockSize + blockMargin) * dayIndex}
      {...props}
    />
  );
};

export type ContributionGraphCalendarProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  hideMonthLabels?: boolean;
  className?: string;
  children: (props: {
    activity: Activity;
    dayIndex: number;
    weekIndex: number;
  }) => ReactNode;
};

export const ContributionGraphCalendar = ({
  hideMonthLabels = false,
  className,
  children,
  ...props
}: ContributionGraphCalendarProps) => {
  const { weeks, width, height, blockSize, blockMargin, labels } =
    useContributionGraph();

  const monthLabels = useMemo(
    () => getMonthLabels(weeks, labels.months),
    [weeks, labels.months],
  );

  return (
    <div
      className={cn("max-w-full overflow-x-auto overflow-y-hidden", className)}
      {...props}
    >
      <svg
        className="block overflow-visible"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        <title>Contribution Graph</title>
        {!hideMonthLabels && (
          <g className="fill-current">
            {monthLabels.map(({ label, weekIndex }) => (
              <text
                dominantBaseline="hanging"
                key={weekIndex}
                x={(blockSize + blockMargin) * weekIndex}
              >
                {label}
              </text>
            ))}
          </g>
        )}
        {weeks.map((week, weekIndex) =>
          week.map((activity, dayIndex) => {
            if (!activity) {
              return null;
            }

            return (
              <Fragment key={`${weekIndex}-${dayIndex}`}>
                {children({ activity, dayIndex, weekIndex })}
              </Fragment>
            );
          }),
        )}
      </svg>
    </div>
  );
};

export type ContributionGraphFooterProps = HTMLAttributes<HTMLDivElement>;

export const ContributionGraphFooter = ({
  className,
  ...props
}: ContributionGraphFooterProps) => (
  <div
    className={cn(
      "flex flex-wrap gap-1 whitespace-nowrap sm:gap-x-4",
      className,
    )}
    {...props}
  />
);

export type ContributionGraphTotalCountProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children?: (props: { totalCount: number; year: number }) => ReactNode;
};

export const ContributionGraphTotalCount = ({
  className,
  children,
  ...props
}: ContributionGraphTotalCountProps) => {
  const { totalCount, year, labels } = useContributionGraph();

  if (children) {
    return <>{children({ totalCount, year })}</>;
  }

  return (
    <div className={cn("text-muted-foreground", className)} {...props}>
      {labels.totalCount
        ? labels.totalCount
            .replace("{{count}}", String(totalCount))
            .replace("{{year}}", String(year))
        : `${totalCount} activities in ${year}`}
    </div>
  );
};

export type ContributionGraphLegendProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children?: (props: { level: number }) => ReactNode;
};

export const ContributionGraphLegend = ({
  className,
  children,
  ...props
}: ContributionGraphLegendProps) => {
  const { labels, maxLevel, blockSize, blockRadius } = useContributionGraph();

  return (
    <div
      className={cn("ml-auto flex items-center gap-[3px]", className)}
      {...props}
    >
      <span className="mr-1 text-muted-foreground">
        {labels.legend?.less || "Less"}
      </span>
      {Array.from({ length: maxLevel + 1 }, (_, level) =>
        children ? (
          <Fragment key={level}>{children({ level })}</Fragment>
        ) : (
          <svg height={blockSize} key={level} width={blockSize}>
            <title>{`${level} contributions`}</title>
            <rect
              className={cn(
                "stroke-[1px] stroke-border",
                'data-[level="0"]:fill-muted',
                'data-[level="1"]:fill-primary/20',
                'data-[level="2"]:fill-primary/40',
                'data-[level="3"]:fill-primary/60',
                'data-[level="4"]:fill-primary/80',
              )}
              data-level={level}
              height={blockSize}
              rx={blockRadius}
              ry={blockRadius}
              width={blockSize}
            />
          </svg>
        ),
      )}
      <span className="ml-1 text-muted-foreground">
        {labels.legend?.more || "More"}
      </span>
    </div>
  );
};
