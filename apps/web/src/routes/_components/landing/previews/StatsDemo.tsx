import { IconCalendar, IconCheck, IconChevronDown } from "@tabler/icons-react";
import {
  Avatar,
  Count,
  Menu,
  Popover,
  Roll,
  Window,
  type Act,
  type Layout,
} from "@/lib/stageshow";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./StatsDemo.css";

// A repository's Stats page. Beats: the range menu opens; Last 90 days is
// picked, so the bars ease to the quarter, PRs shipped rolls up and the
// leaderboard reorders; the pointer comes onto the chart and the headline
// reads out the week under it; it runs right to the busiest week and rests
// there (the payoff). The activity heatmap is context.
//
// Real strings: the headline and its value, the range, the week, the three
// contributors and their counts, the two section labels.

const RANGES = ["Last 7 days", "Last 30 days", "Last 90 days", "All time"];
const MONTH = 1;
const QUARTER = 2;

/** PRs shipped per bucket: about 2.5 days each over 30 days, a week over 90. */
const SERIES = {
  month: [3, 5, 4, 6, 4, 5, 7, 3, 5, 6, 2, 4],
  quarter: [6, 8, 6, 10, 9, 13, 11, 14, 12, 15, 13, 10],
};
const WEEKS = [
  "10 Aug",
  "17 Aug",
  "24 Aug",
  "31 Aug",
  "7 Sep",
  "14 Sep",
  "21 Sep",
  "28 Sep",
  "5 Oct",
  "12 Oct",
  "19 Oct",
  "26 Oct",
];
const PEAK = 9;
const SCRUB_FROM = 5;

const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);

/** Top contributors: Jonas leads the month, Riya the quarter. */
const PEOPLE = [
  { name: "Riya", month: 14, quarter: 34 },
  { name: "Jonas", month: 18, quarter: 27 },
  { name: "Ada", month: 9, quarter: 19 },
];

/** Activity heatmap, 0 to 4: 14 weeks of seven days, written out so it never changes. */
const HEAT = [
  "1021310",
  "0232410",
  "1130220",
  "2341300",
  "0223421",
  "1342310",
  "2143200",
  "0324410",
  "1243320",
  "2434411",
  "1334320",
  "0243410",
  "2344321",
  "1232200",
].map((week) => week.split("").map(Number));

/** The plot's geometry per layout, shared by the bars and the scrub. */
const PLOT = {
  wide: { width: 340, height: 176 },
  compact: { width: 302, height: 120 },
} as const;
const GAP = 6;

function barCenter(layout: Layout, index: number) {
  const { width } = PLOT[layout];
  const bar =
    (width - GAP * (SERIES.quarter.length - 1)) / SERIES.quarter.length;
  return index * (bar + GAP) + bar / 2;
}

function nearestBar(layout: Layout, x: number) {
  let near = 0;
  for (let i = 1; i < SERIES.quarter.length; i++) {
    if (
      Math.abs(barCenter(layout, i) - x) < Math.abs(barCenter(layout, near) - x)
    ) {
      near = i;
    }
  }
  return near;
}

const ROW = 40;
const MENU_WIDTH = 168;

type S = {
  menu: boolean;
  range: number;
  week: number | null;
};

const initial: S = { menu: false, range: MONTH, week: null };
const poster: S = { menu: false, range: QUARTER, week: PEAK };

async function story(a: Act<S>) {
  await a.wait(700);

  a.mark("menu");
  await a.click({ at: "range", x: 0.7, y: 0.6 });
  await a.set({ menu: true });
  await a.wait(500);
  await a.move({ at: "range-2", x: 0.75, y: 0.55 });
  await a.wait(250);
  await a.click();

  a.mark("quarter");
  await a.set({ menu: false, range: QUARTER });
  await a.wait(1500);

  a.mark("hover");
  const plot = a.rect("plot");
  const y = plot.y + plot.height * 0.62;
  const at = (i: number) => ({ x: plot.x + barCenter(a.layout, i), y });
  await a.move(at(SCRUB_FROM), { duration: 800 });
  a.put({ week: SCRUB_FROM });
  await a.wait(700);

  a.mark("scrub");
  await a.move(at(PEAK), {
    duration: 1100,
    path: (e, from, to) => ({
      x: from.x + (to.x - from.x) * e,
      y: from.y + (to.y - from.y) * e,
    }),
    onMove: (pt) => a.put({ week: nearestBar(a.layout, pt.x - plot.x) }),
  });

  a.mark("payoff");
  await a.wait(2300);
}

export function StatsDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="st"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
      cursor={{ wide: { x: 300, y: 372 }, compact: { x: 300, y: 424 } }}
    >
      {(s, rect, layout) => {
        const range = rect("range");
        const series = s.range === QUARTER ? SERIES.quarter : SERIES.month;
        const top = Math.max(...series);
        const plot = PLOT[layout];
        const hovered = s.week !== null && s.range === QUARTER;
        const ranked = PEOPLE.toSorted((x, y) =>
          s.range === QUARTER ? y.quarter - x.quarter : y.month - x.month,
        );
        return (
          <>
            <Window title="Stats" lights="grey" className="st-win">
              <div className="st-body">
                <div className="st-main">
                  <div className="st-head">
                    <div className="st-kpi">
                      <div className="st-label">
                        <Roll variant="fade">
                          {hovered && s.week !== null
                            ? `Week of ${WEEKS[s.week]}`
                            : "PRs shipped"}
                        </Roll>
                      </div>
                      <div className="st-value">
                        <Count
                          value={
                            hovered && s.week !== null
                              ? series[s.week]
                              : sum(series)
                          }
                          duration={hovered ? 360 : 700}
                          stagger={hovered ? 25 : 45}
                        />
                      </div>
                    </div>
                    <div
                      className="st-range"
                      data-target="range"
                      data-cursor="pointer"
                      data-on={s.menu || undefined}
                    >
                      <IconCalendar size={14} />
                      <span className="st-range__label">
                        <Roll variant="fade" align="start">
                          {RANGES[s.range]}
                        </Roll>
                      </span>
                      <IconChevronDown size={14} />
                    </div>
                  </div>

                  <div
                    className="st-plot"
                    data-target="plot"
                    data-cursor="crosshair"
                    data-hovering={hovered || undefined}
                    style={{ width: plot.width, height: plot.height, gap: GAP }}
                  >
                    {series.map((value, i) => (
                      <span
                        key={i}
                        className="st-bar"
                        data-on={(hovered && s.week === i) || undefined}
                        style={{
                          height: Math.max(3, (value / top) * plot.height),
                          transitionDelay: `${i * 22}ms, 0ms`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="st-side">
                  <div className="st-section">Top contributors</div>
                  <div
                    className="st-board"
                    style={{ height: ROW * PEOPLE.length }}
                  >
                    {PEOPLE.map((person) => {
                      const rank = ranked.indexOf(person);
                      return (
                        <div
                          key={person.name}
                          className="st-person"
                          style={{ translate: `0 ${rank * ROW}px` }}
                        >
                          <Avatar name={person.name} size={24} />
                          <span className="st-person__name">{person.name}</span>
                          <Count
                            className="st-person__count"
                            value={
                              s.range === QUARTER
                                ? person.quarter
                                : person.month
                            }
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="st-section st-section--heat">Activity</div>
                  <div className="st-heat" aria-hidden>
                    {HEAT.map((week, w) => (
                      <span key={w} className="st-heat__week">
                        {week.map((level, d) => (
                          <span
                            key={d}
                            className="st-heat__day"
                            data-level={level}
                          />
                        ))}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Window>

            <Popover
              show={s.menu}
              origin="top right"
              className="st-menu"
              style={{
                left: range.x + range.width - MENU_WIDTH,
                top: range.y + range.height + 6,
                width: MENU_WIDTH,
              }}
            >
              <Menu
                items={RANGES.map((range, i) => (
                  <span key={range} className="st-menu__item">
                    <span className="st-menu__tick">
                      {i === s.range ? <IconCheck size={14} /> : null}
                    </span>
                    {range}
                  </span>
                ))}
                targets={RANGES.map((_, i) => `range-${i}`)}
              />
            </Popover>
          </>
        );
      }}
    </LandingStage>
  );
}
