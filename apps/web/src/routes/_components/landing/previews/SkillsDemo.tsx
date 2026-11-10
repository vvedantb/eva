import { IconFileText, IconGitCommit } from "@tabler/icons-react";
import {
  Avatar,
  Badge,
  Bar,
  Check,
  Collapse,
  Row,
  Spinner,
  States,
  Stream,
  Window,
  type Act,
} from "@/lib/stageshow";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./SkillsDemo.css";

// A skill reaches the agent, told by the system with no cursor. Beats: a push
// lands on main with a new skill; the skills list syncs and the new skill opens
// at the top; in a task beside it, the agent loads that skill (the payoff) and
// starts its answer the way the skill says.
//
// Real strings: the folder and its sync status, the commit, the skill names
// and the new skill's description, the task, the loaded skill, the reply.

const REPLY =
  "I will follow the migration rules: widen the table, backfill, then narrow.";
const REPLY_WORDS = REPLY.split(" ").length;

type Sync = "idle" | "syncing" | "synced";

type S = {
  pushed: boolean;
  sync: Sync;
  added: boolean;
  loaded: boolean;
  words: number;
};

const initial: S = {
  pushed: false,
  sync: "idle",
  added: false,
  loaded: false,
  words: 0,
};

const poster: S = {
  pushed: true,
  sync: "synced",
  added: true,
  loaded: true,
  words: REPLY_WORDS,
};

async function story(a: Act<S>) {
  await a.wait(1000);
  a.mark("push");
  a.put({ pushed: true });
  await a.wait(900);

  a.mark("sync");
  a.put({ sync: "syncing" });
  await a.wait(1300);
  a.put({ added: true });
  await a.wait(300);
  a.put({ sync: "synced" });
  await a.wait(1200);

  a.mark("payoff");
  a.put({ loaded: true });
  await a.wait(700);
  for (let i = 1; i <= REPLY_WORDS; i++) {
    a.put({ words: i });
    await a.wait(55);
  }
  await a.wait(2200);
}

/** Skills already in the repository: real names, filler descriptions. */
const SKILLS = [
  { name: "ship", w: 128 },
  { name: "review", w: 104 },
  { name: "changelog", w: 140 },
];

/** Filler skills under the named ones, running off the window's foot. */
const FILLER = [
  [64, 118],
  [82, 96],
];

const fileIcon = <IconFileText size={16} stroke={1.75} className="skl-file" />;

export function SkillsDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="skl"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
    >
      {(s) => (
        <Window title="acme/web" lights="grey" className="skl-win">
          <div className="skl-body">
            <div className="skl-pane skl-skills">
              <div className="skl-head">
                <span className="skl-folder">.agents/skills</span>
                <States
                  className="skl-sync"
                  align="end"
                  value={s.sync}
                  states={{
                    idle: <span>Synced 2 h ago</span>,
                    syncing: (
                      <span className="skl-state">
                        <Spinner size={12} />
                        Syncing
                      </span>
                    ),
                    synced: (
                      <span className="skl-state skl-synced">
                        <Check on size={12} />
                        Synced just now
                      </span>
                    ),
                  }}
                />
              </div>

              <Collapse open={s.pushed} reveal="drop">
                <div className="skl-push">
                  <IconGitCommit
                    size={16}
                    stroke={1.75}
                    className="skl-commit-icon"
                  />
                  <span className="skl-commit">Add migrations skill</span>
                  <span className="skl-sha">4f2a9c1</span>
                </div>
              </Collapse>

              <div className="skl-list">
                <Collapse open={s.added}>
                  <Row
                    className="skl-row skl-row--new"
                    lead={fileIcon}
                    title={
                      <span className="skl-name">
                        migrations
                        <Badge tone="success">New</Badge>
                      </span>
                    }
                    subtitle="Widen, backfill, then narrow"
                  />
                </Collapse>
                {SKILLS.map((skill) => (
                  <Row
                    key={skill.name}
                    className="skl-row"
                    lead={fileIcon}
                    title={<span className="skl-name">{skill.name}</span>}
                    subtitle={<Bar w={skill.w} h={5} tone={2} />}
                  />
                ))}
                {FILLER.map((w, i) => (
                  <Row
                    key={i}
                    className="skl-row skl-filler"
                    lead={fileIcon}
                    title={<Bar w={w[0]} h={6} tone={3} />}
                    subtitle={<Bar w={w[1]} h={5} tone={2} />}
                  />
                ))}
              </div>
            </div>

            <div className="skl-pane skl-task">
              <div className="skl-task-title">
                Add a status column to orders
              </div>
              <div className="skl-thread">
                <div className="skl-ask">
                  <Avatar name="Maya Chen" size={22} />
                  <div className="skl-ask-lines">
                    <Bar w={190} h={6} tone={3} />
                    <Bar w={130} h={6} tone={3} />
                  </div>
                </div>
                <Collapse open={s.loaded} reveal="drop">
                  <div className="skl-answer">
                    <span className="skl-skill-chip">
                      {fileIcon}
                      Loaded skill <span className="skl-name">migrations</span>
                    </span>
                    <Stream
                      className="skl-reply"
                      text={REPLY}
                      count={s.words}
                    />
                  </div>
                </Collapse>
              </div>
              <div className="skl-composer">Ask Eva</div>
            </div>
          </div>
        </Window>
      )}
    </LandingStage>
  );
}
