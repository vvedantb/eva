import { IconGitPullRequest, IconRepeat } from "@tabler/icons-react";
import {
  Bar,
  Check,
  Collapse,
  Count,
  Roll,
  Row,
  Spinner,
  States,
  Swap,
  Window,
  type Act,
} from "@/lib/stageshow";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./AutomationsDemo.css";

// A scheduled run, told by the system with no cursor. Beats: the clock in the
// Automations header rolls to Monday 09:00; the dependency sweep starts and a
// live line under it says what it found; the line moves on to opening pull
// requests; the run finishes and its result drops into the Inbox beside it
// (the payoff), the unread count rolling up with it.
//
// Real strings: the two pane titles, the clock, two automations with their
// schedules and modes (fix and report only), the live line, the inbox result.

type Run = "idle" | "running" | "done";

type S = {
  /** The clock has reached the scheduled time. */
  due: boolean;
  run: Run;
  /** The live line under the running automation is open. */
  live: boolean;
  /** Which step the live line says; kept while it closes so it never swaps. */
  step: 0 | 1;
  delivered: boolean;
};

const initial: S = {
  due: false,
  run: "idle",
  live: false,
  step: 0,
  delivered: false,
};
const poster: S = {
  ...initial,
  due: true,
  run: "done",
  step: 1,
  delivered: true,
};

const STEPS = ["Found 2 outdated packages", "Opening 2 pull requests"];

async function story(a: Act<S>) {
  await a.wait(1400);
  a.mark("due");
  a.put({ due: true });
  await a.wait(700);

  a.mark("run");
  a.put({ run: "running" });
  await a.wait(300);
  a.put({ live: true });
  await a.wait(2000);
  a.put({ step: 1 });
  await a.wait(2000);

  a.mark("payoff");
  a.put({ run: "done", live: false });
  await a.wait(450);
  a.put({ delivered: true });
  await a.wait(2400);
}

/** Filler inbox items already there before the run: they move down for it. */
const OLD = [
  { title: 96, subtitle: 150 },
  { title: 120, subtitle: 128 },
  { title: 84, subtitle: 160 },
  { title: 110, subtitle: 136 },
];

/** Filler automations under the two the story names. */
const MORE = [
  { title: 104, subtitle: 142 },
  { title: 88, subtitle: 160 },
  { title: 118, subtitle: 128 },
];

export function AutomationsDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="aut"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
    >
      {(s) => (
        <Window title="acme/web" lights="grey" className="aut-win">
          <div className="aut-body">
            <div className="aut-pane aut-automations">
              <div className="aut-head">
                <span className="aut-title">Automations</span>
                <Roll className="aut-clock" align="end">
                  {s.due ? "Mon 09:00" : "Mon 08:59"}
                </Roll>
              </div>
              <div className="aut-list">
                <Row
                  className="aut-row"
                  selected={s.run === "running" || undefined}
                  lead={
                    <span className="aut-tile">
                      <IconRepeat size={16} stroke={1.75} />
                    </span>
                  }
                  title="Dependency sweep"
                  subtitle="Mondays at 09:00 · Fix"
                  meta={
                    <States
                      className="aut-status"
                      align="end"
                      value={s.run}
                      states={{
                        idle: <span>in 1 min</span>,
                        running: (
                          <span className="aut-state">
                            <Spinner size={12} />
                            Running
                          </span>
                        ),
                        done: (
                          <span className="aut-state aut-done">
                            <Check on size={12} />
                            Done
                          </span>
                        ),
                      }}
                    />
                  }
                />
                <Collapse open={s.live}>
                  <div className="aut-live">
                    <Swap id={s.step}>{STEPS[s.step]}</Swap>
                  </div>
                </Collapse>
                <Row
                  className="aut-row"
                  lead={
                    <span className="aut-tile">
                      <IconRepeat size={16} stroke={1.75} />
                    </span>
                  }
                  title="Flaky test report"
                  subtitle="Nightly at 02:00 · Report only"
                  meta={<span>in 17 h</span>}
                />
                {MORE.map((r, i) => (
                  <Row
                    key={i}
                    className="aut-row aut-row--filler"
                    lead={<span className="aut-tile aut-tile--blank" />}
                    title={<Bar w={r.title} h={6} tone={3} />}
                    subtitle={<Bar w={r.subtitle} h={5} tone={2} />}
                    meta={<Bar w={30} h={5} tone={2} />}
                  />
                ))}
              </div>
            </div>

            <div className="aut-pane aut-inbox">
              <div className="aut-head">
                <span className="aut-title">Inbox</span>
                <span className="aut-unread">
                  <Count value={s.delivered ? 3 : 2} duration={500} />
                </span>
              </div>
              <div className="aut-list aut-feed">
                <Collapse open={s.delivered}>
                  <Row
                    className="aut-row"
                    unread
                    lead={
                      <span className="aut-tile aut-tile--result">
                        <IconGitPullRequest size={16} stroke={1.75} />
                      </span>
                    }
                    title="Dependency sweep"
                    subtitle="Opened 2 pull requests"
                    meta={<span>09:04</span>}
                  />
                </Collapse>
                {OLD.map((r, i) => (
                  <Row
                    key={i}
                    className="aut-row"
                    lead={<span className="aut-tile aut-tile--blank" />}
                    title={<Bar w={r.title} h={6} tone={3} />}
                    subtitle={<Bar w={r.subtitle} h={5} tone={2} />}
                    meta={<Bar w={28} h={5} tone={2} />}
                  />
                ))}
              </div>
            </div>
          </div>
        </Window>
      )}
    </LandingStage>
  );
}
