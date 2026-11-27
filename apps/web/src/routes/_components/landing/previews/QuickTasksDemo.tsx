import { IconGitBranch } from "@tabler/icons-react";
import {
  Badge,
  Bar,
  Check,
  Collapse,
  Count,
  Field,
  Row,
  States,
  Window,
  type Act,
} from "@/lib/stageshow";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./QuickTasksDemo.css";

// Quick tasks: small changes, many at once. Beats: three tasks are already
// running; the visitor types a fourth and runs it, and it starts at once
// beside them (no queue); then the tasks finish one by one, each landing in
// review with its own pull request while the running count rolls down. The
// payoff is the new task landing too: every row in review, nothing running.
//
// Real strings: the typed task, the task titles, their branches, the pull
// request numbers and the two counts. The older, merged tasks are bars.

type Status = "running" | "review";

interface Task {
  title: string;
  branch: string;
  pr: number;
}

/** Newest first. The first is the one the visitor types. */
const TASKS: readonly Task[] = [
  { title: "Bump vite to 8.1", branch: "eva/bump-vite", pr: 142 },
  { title: "Add empty state to inbox", branch: "eva/inbox-empty", pr: 140 },
  { title: "Fix postcode validation", branch: "eva/postcode-space", pr: 141 },
  { title: "Delete unused feature flag", branch: "eva/drop-flag", pr: 139 },
];

const TYPED = TASKS[0].title;

/** Merged tasks from before the story: filler under the live rows. */
const OLDER = [
  { title: 132, branch: 88 },
  { title: 164, branch: 104 },
];

type S = {
  draft: string;
  focused: boolean;
  added: boolean;
  status: readonly Status[];
  review: number;
};

const initial: S = {
  draft: "",
  focused: false,
  added: false,
  status: ["running", "running", "running", "running"],
  review: 2,
};

const poster: S = {
  draft: "",
  focused: false,
  added: true,
  status: ["review", "review", "review", "review"],
  review: 6,
};

const running = (s: S) =>
  s.status.filter((st, i) => st === "running" && (i > 0 || s.added)).length;

const finish = (status: readonly Status[], i: number) =>
  status.map((st, j) => (j === i ? "review" : st));

async function story(a: Act<S>) {
  await a.wait(600);
  a.mark("type");
  await a.click({ at: "composer", x: 0.3, y: 0.5 });
  a.put({ focused: true });
  await a.type("draft", TYPED, { interval: 45 });
  await a.wait(250);

  a.mark("run");
  await a.click({ at: "run", x: 0.7, y: 0.6 });
  await a.set({ draft: "", focused: false, added: true });
  await a.move({ at: "counts", x: 1.4, y: 0.5 });
  await a.wait(700);

  // They finish in their own time, each with its own pull request
  a.mark("finish");
  for (const i of [3, 1, 2]) {
    await a.set((s) => ({ status: finish(s.status, i), review: s.review + 1 }));
    await a.wait(950);
  }

  a.mark("payoff");
  await a.set((s) => ({ status: finish(s.status, 0), review: s.review + 1 }));
  await a.wait(2200);
}

function TaskRow({ task, status }: { task: Task; status: Status }) {
  const done = status === "review";
  return (
    <Row
      className="qt-row"
      pad={10}
      lead={<Check on={done} pending={!done} size={16} />}
      title={<span className="qt-title">{task.title}</span>}
      subtitle={
        <span className="qt-branch">
          <IconGitBranch size={12} stroke={1.75} aria-hidden />
          {task.branch}
        </span>
      }
    >
      <span className="qt-trail">
        <span className="qt-pr" data-on={done || undefined}>
          #{task.pr}
        </span>
        <States
          align="end"
          value={status}
          states={{
            running: <Badge tone="neutral">Running</Badge>,
            review: <Badge tone="success">In review</Badge>,
          }}
        />
      </span>
    </Row>
  );
}

export function QuickTasksDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="qt"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
      cursor={{ wide: { x: 560, y: 150 }, compact: { x: 300, y: 150 } }}
    >
      {(s) => (
        <Window title="Quick tasks" lights="grey" className="qt-win">
          <div className="qt-body">
            <Field
              className="qt-composer"
              value={s.draft}
              placeholder="Describe a small change"
              focused={s.focused}
              box={{ "data-target": "composer" }}
              trailing={
                <span
                  className="qt-run"
                  data-target="run"
                  data-cursor="pointer"
                >
                  Run
                </span>
              }
            />

            <div className="qt-counts" data-target="counts">
              <span className="qt-count">
                <Count value={running(s)} />
                running
              </span>
              <span className="qt-sep" aria-hidden>
                ·
              </span>
              <span className="qt-count">
                <Count value={s.review} />
                in review
              </span>
            </div>

            <div className="qt-list">
              <Collapse open={s.added}>
                <TaskRow task={TASKS[0]} status={s.status[0]} />
              </Collapse>
              {TASKS.slice(1).map((task, i) => (
                <TaskRow key={task.pr} task={task} status={s.status[i + 1]} />
              ))}
              {OLDER.map((row) => (
                <Row
                  key={row.title}
                  className="qt-row"
                  pad={10}
                  lead={<Check on size={16} />}
                  title={<Bar w={row.title} h={7} tone={3} />}
                  subtitle={<Bar w={row.branch} h={6} tone={2} />}
                >
                  <span className="qt-trail">
                    <Bar w={30} h={6} tone={2} className="qt-pr" data-on />
                    <Bar w={58} h={20} r={10} tone={2} />
                  </span>
                </Row>
              ))}
            </div>
          </div>
        </Window>
      )}
    </LandingStage>
  );
}
