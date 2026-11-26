import {
  IconExclamationCircle,
  IconGitPullRequest,
  IconMessage,
  type Icon,
} from "@tabler/icons-react";
import {
  Bar,
  Collapse,
  Count,
  Row,
  States,
  Window,
  type Act,
} from "@/lib/stageshow";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./InboxDemo.css";

// The inbox, while work lands in it. Beats: a task run finishes with a
// failing check and drops in at the top; a pull request becomes ready for
// review and drops in above it, the unread count rolling with each; the
// visitor opens the pull request, its dot clears and the detail pane shows it
// with its one action (the payoff).
//
// Real strings: the three notifications, their times, the unread count, the
// open notification's detail and its button. Older rows are placeholder.

type Kind = "pr" | "run" | "question";

const KINDS: Record<Kind, { icon: Icon; tone: string }> = {
  pr: { icon: IconGitPullRequest, tone: "accent" },
  run: { icon: IconExclamationCircle, tone: "danger" },
  question: { icon: IconMessage, tone: "neutral" },
};

/** Older rows under the story: bar widths for the title, line two and time. */
const OLDER = [
  { title: 132, sub: 96, meta: 18, unread: true },
  { title: 108, sub: 120, meta: 22 },
  { title: 146, sub: 84, meta: 18 },
  { title: 118, sub: 104, meta: 20 },
];

type S = {
  run: boolean;
  pr: boolean;
  open: "pr" | "question";
  prRead: boolean;
  unread: number;
};

const initial: S = {
  run: false,
  pr: false,
  open: "question",
  prRead: false,
  unread: 1,
};

const poster: S = {
  run: true,
  pr: true,
  open: "pr",
  prRead: true,
  unread: 2,
};

async function story(a: Act<S>) {
  await a.wait(1300);

  a.mark("run");
  await a.set({ run: true, unread: 2 });
  await a.wait(1800);

  a.mark("pr");
  await a.set({ pr: true, unread: 3 });
  await a.wait(1700);

  a.mark("open");
  await a.move({ at: "row-pr", x: 0.93, y: 0.72 });
  await a.wait(300);
  await a.click();
  await a.set({ open: "pr", prRead: true, unread: 2 });

  a.mark("payoff");
  await a.wait(2500);
}

function Lead({ kind }: { kind: Kind }) {
  const { icon: Glyph, tone } = KINDS[kind];
  return (
    <span className="ib-lead" data-tone={tone}>
      <Glyph size={16} stroke={1.75} />
    </span>
  );
}

export function InboxDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="ib"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
      cursor={{ wide: { x: 520, y: 330 }, compact: { x: 250, y: 400 } }}
    >
      {(s) => (
        <Window title="Inbox" lights="grey" className="ib-win">
          <div className="ib-body">
            <div className="ib-list">
              <div className="ib-head">
                <span className="ib-head__title">All notifications</span>
                <span className="ib-unread">
                  <Count value={s.unread} format={(n) => `${n} unread`} />
                </span>
              </div>

              <div className="ib-rows">
                <Collapse open={s.pr} reveal="drop">
                  <Row
                    className="ib-row"
                    data-target="row-pr"
                    data-cursor="pointer"
                    pad={10}
                    unread={!s.prRead}
                    selected={s.open === "pr"}
                    lead={<Lead kind="pr" />}
                    title="#142 is ready for review"
                    subtitle="Fix checkout postcode validation"
                    meta="now"
                  />
                </Collapse>
                <Collapse open={s.run} reveal="drop">
                  <Row
                    className="ib-row"
                    pad={10}
                    unread
                    lead={<Lead kind="run" />}
                    title="Task run finished"
                    subtitle="1 failing check · acme/web"
                    meta="2m"
                  />
                </Collapse>
                <Row
                  className="ib-row"
                  pad={10}
                  selected={s.open === "question"}
                  lead={<Lead kind="question" />}
                  title="Agent asked a question"
                  subtitle="Session on acme/api"
                  meta="1h"
                />
                {OLDER.map((row, i) => (
                  <Row
                    key={i}
                    className="ib-row ib-row--older"
                    pad={10}
                    unread={row.unread}
                    lead={<span className="ib-lead" data-tone="filler" />}
                    title={
                      <Bar w={row.title} h={6} tone={row.unread ? 4 : 3} />
                    }
                    subtitle={<Bar w={row.sub} h={6} tone={2} />}
                    meta={<Bar w={row.meta} h={6} tone={2} />}
                  />
                ))}
              </div>
            </div>

            <div className="ib-detail">
              <States
                align="start"
                value={s.open}
                states={{
                  question: (
                    <div className="ib-card">
                      <Lead kind="question" />
                      <div className="ib-card__title">
                        Agent asked a question
                      </div>
                      <div className="ib-card__sub">
                        Session on acme/api · 1h ago
                      </div>
                      <div className="ib-card__lines">
                        <Bar w={260} h={6} tone={2} />
                        <Bar w={220} h={6} tone={2} />
                        <Bar w={240} h={6} tone={2} />
                      </div>
                      <span className="ib-button">Open session</span>
                    </div>
                  ),
                  pr: (
                    <div className="ib-card">
                      <Lead kind="pr" />
                      <div className="ib-card__title">
                        #142 is ready for review
                      </div>
                      <div className="ib-card__sub">
                        Fix checkout postcode validation · acme/web
                      </div>
                      <div className="ib-card__lines">
                        <Bar w={250} h={6} tone={2} />
                        <Bar w={270} h={6} tone={2} />
                        <Bar w={190} h={6} tone={2} />
                      </div>
                      <span className="ib-button" data-primary>
                        Review pull request
                      </span>
                    </div>
                  ),
                }}
              />
            </div>
          </div>
        </Window>
      )}
    </LandingStage>
  );
}
