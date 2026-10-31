import { IconCheck, IconChevronDown, IconKey } from "@tabler/icons-react";
import {
  Badge,
  Bar,
  Collapse,
  Menu,
  Popover,
  Roll,
  Row,
  States,
  Window,
  type Act,
} from "@/lib/stageshow";
import { BrandMark, type BrandName } from "../BrandMark";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./AgentsDemo.css";

// Any agent, chosen per task. Beats: a task is written in the composer with
// Claude Code picked; the visitor opens the agent menu (all four installed),
// picks Codex, and the key under the composer follows to OPENAI_API_KEY;
// Start runs it, and the task opens, starting then running, at the top of the list with the Codex
// mark beside earlier tasks run by the other agents (the payoff).
//
// Real strings: the task, the four agent names, the key, the new row's
// agent and branch. Earlier tasks are bars beside their agent's mark.

type Agent = "claude" | "codex";

const AGENTS: readonly { brand: BrandName; name: string }[] = [
  { brand: "claude", name: "Claude Code" },
  { brand: "openai", name: "Codex" },
  { brand: "opencode", name: "opencode" },
  { brand: "cursor", name: "Cursor" },
];

const NAME: Record<Agent, string> = { claude: "Claude Code", codex: "Codex" };
const KEY: Record<Agent, string> = {
  claude: "ANTHROPIC_API_KEY",
  codex: "OPENAI_API_KEY",
};

const TASK = "Add rate limiting to the public API";

/** Earlier tasks, each run by a different agent. */
const EARLIER: readonly { brand: BrandName; title: number; sub: number }[] = [
  { brand: "claude", title: 168, sub: 96 },
  { brand: "cursor", title: 136, sub: 112 },
  { brand: "opencode", title: 182, sub: 84 },
  { brand: "claude", title: 124, sub: 100 },
];

type S = {
  agent: Agent;
  menu: boolean;
  started: boolean;
  running: boolean;
};

const initial: S = {
  agent: "claude",
  menu: false,
  started: false,
  running: false,
};
const poster: S = {
  agent: "codex",
  menu: false,
  started: true,
  running: true,
};

async function story(a: Act<S>) {
  await a.wait(900);
  a.mark("open");
  await a.click({ at: "picker", x: 0.85, y: 0.6 });
  await a.set({ menu: true });
  await a.wait(900);

  a.mark("pick");
  await a.move({ at: "agent-openai", x: 0.8, y: 0.5 });
  await a.wait(350);
  await a.click({ at: "agent-openai", x: 0.8, y: 0.5 });
  await a.set({ agent: "codex" });
  await a.wait(200);
  await a.set({ menu: false });
  await a.wait(1100);

  a.mark("start");
  await a.click({ at: "start", x: 0.7, y: 0.6 });
  await a.set({ started: true });
  await a.move({ at: "start", x: 0.7, y: 1.9 });
  await a.wait(500);

  // The CLI is already in the sandbox: no install step, it just runs
  a.mark("payoff");
  await a.set({ running: true });
  await a.wait(2300);
}

function Mark({ agent }: { agent: Agent }) {
  return (
    <States
      className="ag-mark"
      value={agent}
      states={{
        claude: <BrandMark name="claude" size={14} />,
        codex: <BrandMark name="openai" size={14} />,
      }}
    />
  );
}

export function AgentsDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="ag"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
      cursor={{ wide: { x: 520, y: 210 }, compact: { x: 280, y: 230 } }}
    >
      {(s) => (
        <Window title="acme/web" lights="grey" className="ag-win">
          <div className="ag-body">
            <div className="ag-composer">
              <div className="ag-prompt">
                <span className="ag-text" data-on={!s.started || undefined}>
                  {TASK}
                </span>
                <span
                  className="ag-placeholder"
                  data-on={s.started || undefined}
                >
                  Describe a task
                </span>
              </div>
              <div className="ag-foot">
                <span
                  className="ag-picker"
                  data-target="picker"
                  data-cursor="pointer"
                  data-open={s.menu || undefined}
                >
                  <Mark agent={s.agent} />
                  <Roll variant="fade">{NAME[s.agent]}</Roll>
                  <IconChevronDown size={14} stroke={1.75} aria-hidden />
                </span>
                <span
                  className="ag-start"
                  data-target="start"
                  data-cursor="pointer"
                >
                  Start
                </span>
              </div>

              <Popover show={s.menu} className="ag-menu">
                <Menu
                  value={AGENTS.findIndex((x) => x.name === NAME[s.agent])}
                  targets={AGENTS.map((x) => `agent-${x.brand}`)}
                  items={AGENTS.map((x) => (
                    <>
                      <BrandMark name={x.brand} size={14} />
                      <span className="ag-menu-name">{x.name}</span>
                      <IconCheck
                        size={14}
                        stroke={2}
                        className="ag-menu-check"
                        data-on={x.name === NAME[s.agent] || undefined}
                        aria-hidden
                      />
                    </>
                  ))}
                />
              </Popover>
            </div>

            <div className="ag-key">
              <IconKey size={16} stroke={1.75} aria-hidden />
              <span className="ag-env">
                <Roll variant="fade">{KEY[s.agent]}</Roll>
              </span>
              <span>from your environment</span>
            </div>

            <div className="ag-list">
              <Collapse open={s.started}>
                <Row
                  className="ag-row"
                  pad={10}
                  lead={<BrandMark name="openai" size={16} />}
                  title={<span className="ag-title">{TASK}</span>}
                  subtitle={
                    <span className="ag-sub">Codex · eva/rate-limit</span>
                  }
                >
                  <States
                    align="end"
                    value={s.running ? "running" : "starting"}
                    states={{
                      starting: <Badge tone="neutral">Starting</Badge>,
                      running: <Badge tone="accent">Running</Badge>,
                    }}
                  />
                </Row>
              </Collapse>
              {EARLIER.map((row, i) => (
                <Row
                  key={i}
                  className="ag-row"
                  pad={10}
                  lead={<BrandMark name={row.brand} size={16} />}
                  title={<Bar w={row.title} h={7} tone={3} />}
                  subtitle={<Bar w={row.sub} h={6} tone={2} />}
                >
                  <Bar w={56} h={20} r={10} tone={2} />
                </Row>
              ))}
            </div>
          </div>
        </Window>
      )}
    </LandingStage>
  );
}
