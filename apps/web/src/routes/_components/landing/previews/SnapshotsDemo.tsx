import { IconStack2 } from "@tabler/icons-react";
import {
  Bar,
  Check,
  Count,
  Spinner,
  Swap,
  Window,
  type Act,
} from "@/lib/stageshow";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./SnapshotsDemo.css";

// A sandbox boots from a snapshot, told by the system with no cursor. Beats:
// the boot starts and the timer runs; the steps tick off one after another
// because each is already in the image (tooling, dependencies, a seeded
// database); the dev server comes up and the preview loads beside the list;
// the header reads ready with the timer stopped at 6s (the payoff).
//
// Real strings: the header and its timer, the snapshot line, the five steps
// and their details, the preview's address.

const STEPS = [
  { label: "Restore snapshot", detail: "Built 03:00" },
  { label: "Tooling", detail: "Node, pnpm, agent CLIs" },
  { label: "Dependencies", detail: "Cached" },
  { label: "Database", detail: "Seeded" },
  { label: "Dev server", detail: "Port 3000" },
];

/** Steps finished after each second on the timer: the dev server takes two. */
const DONE_AT = [1, 2, 3, 3, 4, 5];

type S = { booting: boolean; secs: number; done: number; ready: boolean };

const initial: S = { booting: false, secs: 0, done: 0, ready: false };
const poster: S = { booting: true, secs: 6, done: STEPS.length, ready: true };

async function story(a: Act<S>) {
  await a.wait(1100);
  a.mark("boot");
  a.put({ booting: true });
  for (let t = 1; t <= DONE_AT.length; t++) {
    await a.wait(800);
    a.put({ secs: t, done: DONE_AT[t - 1] });
  }
  await a.wait(250);

  a.mark("payoff");
  a.put({ ready: true });
  await a.wait(2500);
}

/** Filler table rows on the app the preview loads. */
const TABLE = [
  [72, 48, 40],
  [96, 36, 52],
  [60, 52, 40],
  [84, 40, 48],
  [68, 56, 36],
];

export function SnapshotsDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="snap"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
    >
      {(s) => (
        <Window title="acme/web" lights="grey" className="snap-win">
          <div className="snap-body">
            <div className="snap-boot">
              <div className="snap-head">
                <span className="snap-title">
                  <Swap id={s.ready ? "ready" : "starting"}>
                    {s.ready ? "Sandbox ready" : "Starting sandbox"}
                  </Swap>
                </span>
                <Count
                  className="snap-timer"
                  data-ready={s.ready || undefined}
                  value={s.secs}
                  duration={420}
                  format={(n) => `${Math.round(n)}s`}
                />
              </div>
              <div className="snap-source">
                <IconStack2 size={14} stroke={1.75} />
                From snapshot, rebuilt nightly
              </div>
              <div className="snap-steps">
                {STEPS.map((step, i) => (
                  <div
                    key={step.label}
                    className="snap-step"
                    data-on={i < s.done || undefined}
                  >
                    <Check
                      size={16}
                      on={i < s.done}
                      pending={s.booting && i === s.done}
                    />
                    <span className="snap-label">{step.label}</span>
                    <span className="snap-detail">{step.detail}</span>
                  </div>
                ))}
              </div>
              <div className="snap-note">
                No snapshot? It starts from a fresh clone.
              </div>
            </div>

            <div className="snap-preview">
              <div className="snap-bar">
                <span className="snap-url">localhost:3000</span>
              </div>
              <div className="snap-view">
                <div className="snap-wait" data-on={!s.ready || undefined}>
                  <Spinner size={16} />
                  <Bar w={110} h={6} tone={2} />
                </div>
                <div className="snap-app" data-on={s.ready || undefined}>
                  <div className="snap-nav">
                    <Bar w={44} h={8} tone={4} />
                    <Bar w={34} h={6} tone={2} />
                    <Bar w={40} h={6} tone={2} />
                    <Bar w={30} h={6} tone={2} />
                  </div>
                  <div className="snap-page">
                    <Bar w={120} h={10} tone={4} />
                    <div className="snap-table">
                      {TABLE.map((row, i) => (
                        <div key={i} className="snap-trow">
                          <Bar w={row[0]} h={6} tone={3} />
                          <Bar w={row[1]} h={6} tone={2} />
                          <Bar w={row[2]} h={14} r={7} tone={2} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Window>
      )}
    </LandingStage>
  );
}
