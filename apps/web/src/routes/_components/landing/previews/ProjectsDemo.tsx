import {
  IconCircleDashed,
  IconGitMerge,
  IconGitPullRequest,
} from "@tabler/icons-react";
import {
  Count,
  Meter,
  Spinner,
  States,
  Window,
  type Act,
} from "@/lib/stageshow";
import { BrandMark, type BrandName } from "../BrandMark";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./ProjectsDemo.css";

// A project's build pipeline. Beats: the visitor starts the build; two queued
// tasks start running (the third waits for a free agent); the reviewed task
// merges; the first to finish opens its pull request and the queued one
// starts; the last moves to review; the first merges too (the payoff: three of
// five merged, the meter filled to match). After the click it runs on its own.
//
// Wide is the board, cards travelling column to column. Compact is the list
// view of the same project: rows stay put and their status changes in place.
//
// Real strings: the five task titles, their statuses, the column names, the
// progress and the button.

type Col = 0 | 1 | 2 | 3;
type Id = "address" | "basket" | "postcode" | "tax" | "cards";

interface Task {
  title: string;
  agent: BrandName;
  pr: string;
}

const TASKS: Record<Id, Task> = {
  basket: { title: "Basket totals", agent: "openai", pr: "#209" },
  address: { title: "Address form", agent: "claude", pr: "#212" },
  postcode: { title: "Postcode lookup", agent: "claude", pr: "#221" },
  tax: { title: "Tax rules", agent: "cursor", pr: "#223" },
  cards: { title: "Saved cards", agent: "openai", pr: "#226" },
};
const IDS: readonly Id[] = ["basket", "address", "postcode", "tax", "cards"];
const COLUMNS = ["Todo", "Running", "In review", "Merged"] as const;
const COLS: readonly Col[] = [0, 1, 2, 3];
const TOTAL = IDS.length;

/** Where a task sits: its column, and when it arrived there (cards stack in arrival order). */
type Place = { col: Col; seq: number };
type S = { build: boolean; at: Record<Id, Place> };

const initial: S = {
  build: false,
  at: {
    basket: { col: 3, seq: 0 },
    address: { col: 2, seq: 1 },
    postcode: { col: 0, seq: 2 },
    tax: { col: 0, seq: 3 },
    cards: { col: 0, seq: 4 },
  },
};

const poster: S = {
  build: true,
  at: {
    basket: { col: 3, seq: 0 },
    address: { col: 3, seq: 7 },
    postcode: { col: 3, seq: 10 },
    tax: { col: 2, seq: 9 },
    cards: { col: 1, seq: 8 },
  },
};

// Card pitch on the board; the CSS sizes columns (140 + 8) and cards (60) to match.
const COL_STEP = 148;
const ROW_STEP = 68;

async function story(a: Act<S>) {
  let seq = 5;
  const moves = (...ids: [Id, Col][]) => {
    a.put((s) => {
      const at = { ...s.at };
      for (const [id, col] of ids) at[id] = { col, seq: seq++ };
      return { at };
    });
  };

  await a.wait(500);
  a.mark("build");
  await a.click({ at: "build", x: 0.8, y: 0.6 });
  a.put({ build: true });
  void a.move(REST[a.layout]);
  await a.wait(450);

  a.mark("running");
  moves(["postcode", 1]);
  await a.wait(160);
  moves(["tax", 1]);
  await a.wait(1400);

  a.mark("merge");
  moves(["address", 3]);
  await a.wait(1100);

  a.mark("review");
  moves(["postcode", 2]);
  await a.wait(200);
  moves(["cards", 1]);
  await a.wait(1100);
  moves(["tax", 2]);
  await a.wait(1100);

  a.mark("payoff");
  moves(["postcode", 3]);
  await a.wait(2600);
}

/** Where the pointer waits: on empty ground, clear of the board's words. */
const REST = {
  wide: { x: 520, y: 82 },
  compact: { x: 250, y: 410 },
} as const;

/** Each task's slot in its column: its rank among the tasks that arrived there before it. */
function slotOf(at: Record<Id, Place>, id: Id) {
  const mine = at[id];
  return IDS.filter(
    (other) => at[other].col === mine.col && at[other].seq < mine.seq,
  ).length;
}

function countIn(at: Record<Id, Place>, col: Col) {
  return IDS.filter((id) => at[id].col === col).length;
}

export function ProjectsDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="pj"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
      cursor={REST}
    >
      {(s, _rect, layout) => {
        const merged = countIn(s.at, 3);
        return (
          <Window title="Checkout rework" lights="grey" className="pj-win">
            <div className="pj-body">
              <div className="pj-head">
                <div className="pj-progress">
                  <Meter
                    value={merged / TOTAL}
                    tone="success"
                    className="pj-meter"
                  />
                  <span className="pj-merged">
                    <Count value={merged} /> of {TOTAL} merged
                  </span>
                </div>
                <span
                  className="pj-build"
                  data-target="build"
                  data-cursor="pointer"
                  data-on={s.build || undefined}
                >
                  <States
                    value={s.build ? "on" : "off"}
                    states={{
                      off: <span>Start build</span>,
                      on: (
                        <span className="pj-build-on">
                          <Spinner size={12} />
                          Building
                        </span>
                      ),
                    }}
                  />
                </span>
              </div>

              {layout === "wide" ? (
                <div className="pj-board">
                  {COLS.map((col) => (
                    <div key={col} className="pj-col">
                      <div className="pj-col-head">
                        <span>{COLUMNS[col]}</span>
                        <Count
                          className="pj-col-count"
                          value={countIn(s.at, col)}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="pj-cards">
                    {IDS.map((id) => {
                      const place = s.at[id];
                      const x = place.col * COL_STEP;
                      const y = slotOf(s.at, id) * ROW_STEP;
                      return (
                        <div
                          key={id}
                          className="pj-card"
                          // The latest arrival travels over the cards it passes.
                          style={{
                            transform: `translate(${x}px, ${y}px)`,
                            zIndex: place.seq,
                          }}
                        >
                          <span className="pj-title">{TASKS[id].title}</span>
                          <span className="pj-meta">
                            <Status task={TASKS[id]} col={place.col} />
                            <BrandMark name={TASKS[id].agent} size={14} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="pj-list">
                  {IDS.map((id) => (
                    <div key={id} className="pj-row">
                      <BrandMark name={TASKS[id].agent} size={14} />
                      <span className="pj-title">{TASKS[id].title}</span>
                      <Status task={TASKS[id]} col={s.at[id].col} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Window>
        );
      }}
    </LandingStage>
  );
}

/** A task's status, crossfaded in one slot as it moves along the pipeline. */
function Status({ task, col }: { task: Task; col: Col }) {
  return (
    <States
      align="start"
      className="pj-status"
      value={COLUMNS[col]}
      states={{
        Todo: (
          <span className="pj-state">
            <span className="pj-glyph">
              <IconCircleDashed size={14} stroke={1.75} aria-hidden />
            </span>
            Queued
          </span>
        ),
        Running: (
          <span className="pj-state">
            <span className="pj-glyph">
              <Spinner size={14} />
            </span>
            Running
          </span>
        ),
        "In review": (
          <span className="pj-state">
            <span className="pj-glyph">
              <IconGitPullRequest size={14} stroke={1.75} aria-hidden />
            </span>
            {task.pr}
          </span>
        ),
        Merged: (
          <span className="pj-state pj-done">
            <span className="pj-glyph">
              <IconGitMerge size={14} stroke={1.75} aria-hidden />
            </span>
            Merged
          </span>
        ),
      }}
    />
  );
}
