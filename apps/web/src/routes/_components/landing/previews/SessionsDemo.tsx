import {
  Bar,
  Code,
  Collapse,
  Field,
  States,
  Stream,
  Tabs,
  Window,
  type Act,
} from "@/lib/stageshow";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./SessionsDemo.css";

// A live session: the agent fixes a bug while the visitor watches each pane of
// the sandbox. Beats: the reply streams under the bug report; the visitor opens
// Diff and the fix writes itself in; Terminal shows the tests passing; back on
// Preview the same postcode is now accepted (the payoff) and the chat says the
// pull request is open.
//
// Real strings: the bug report, the reply, the two diff lines, the test
// result, the postcode and its error, the pull request.

const REPLY =
  "The pattern rejects the space. I will allow one and run the tests.";
const REPLY_WORDS = REPLY.split(" ").length;

const DIFF = [
  "export const POSTCODE =",
  { text: "  /^[A-Z]{1,2}\\d[A-Z\\d]?\\d[A-Z]{2}$/i;", kind: "del" as const },
  { text: "  /^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$/i;", kind: "add" as const },
];

const TABS = ["Preview", "Terminal", "Diff"];
const TAB_TARGETS = ["tab-preview", "tab-terminal", "tab-diff"];

type Pane = 0 | 1 | 2;
type Status = "idle" | "editing" | "testing" | "done";

type S = {
  words: number;
  status: Status;
  tab: Pane;
  diff: number;
  tests: number;
  fixed: boolean;
};

const initial: S = {
  words: 0,
  status: "idle",
  tab: 0,
  diff: 0,
  tests: 0,
  fixed: false,
};

const poster: S = {
  words: REPLY_WORDS,
  status: "done",
  tab: 0,
  diff: DIFF.length,
  tests: 2,
  fixed: true,
};

async function story(a: Act<S>) {
  await a.wait(700);
  a.mark("reply");
  for (let i = 1; i <= REPLY_WORDS; i++) {
    a.put({ words: i });
    await a.wait(55);
  }
  a.put({ status: "editing" });
  await a.wait(500);

  a.mark("diff");
  await a.click("tab-diff");
  await a.set({ tab: 2 });
  await a.wait(350);
  for (let i = 1; i <= DIFF.length; i++) {
    a.put({ diff: i });
    await a.wait(320);
  }
  await a.wait(900);

  a.mark("tests");
  a.put({ status: "testing" });
  await a.click("tab-terminal");
  await a.set({ tab: 1 });
  await a.wait(500);
  a.put({ tests: 1 });
  await a.wait(700);
  a.put({ tests: 2 });
  await a.wait(1000);

  a.mark("payoff");
  await a.click("tab-preview");
  await a.set({ tab: 0, fixed: true });
  await a.wait(300);
  a.put({ status: "done" });
  await a.wait(2400);
}

export function SessionsDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="sd"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
      cursor={{ wide: { x: 470, y: 330 }, compact: { x: 250, y: 400 } }}
    >
      {(s) => (
        <Window
          title="Fix postcode validation"
          lights="grey"
          className="sd-win"
        >
          <div className="sd-body">
            <div className="sd-chat">
              <div className="sd-ask">Postcodes with a space fail validation.</div>
              <Stream className="sd-reply" text={REPLY} count={s.words} />
              <div className="sd-status" data-on={s.status !== "idle" || undefined}>
                <States
                  align="start"
                  value={s.status}
                  states={{
                    idle: <span />,
                    editing: <span>Editing validate.ts</span>,
                    testing: <span>Running tests</span>,
                    done: <span className="sd-pr">Opened pull request #142</span>,
                  }}
                />
              </div>
              <div className="sd-composer">Ask Eva</div>
            </div>

            <div className="sd-work">
              <Tabs
                className="sd-tabs"
                items={TABS}
                value={s.tab}
                targets={TAB_TARGETS}
                data-cursor="pointer"
              />
              <div className="sd-panes">
                <div className="sd-pane sd-preview" data-on={s.tab === 0 || undefined}>
                  <div className="sd-page">
                    <div className="sd-page-title">Delivery address</div>
                    <div className="sd-filler">
                      <Bar w={120} h={6} tone={2} />
                      <div className="sd-filler-box">
                        <Bar w={150} h={6} tone={3} />
                      </div>
                    </div>
                    <Field
                      label="Postcode"
                      value="SW1A 1AA"
                      status={s.fixed ? "valid" : "error"}
                    />
                    <Collapse open={!s.fixed}>
                      <div className="sd-error">Enter a valid postcode</div>
                    </Collapse>
                    <div className="sd-continue" data-on={s.fixed || undefined}>
                      Continue
                    </div>
                  </div>
                </div>

                <div className="sd-pane sd-terminal" data-on={s.tab === 1 || undefined}>
                  <div className="sd-line">
                    <span className="sd-sigil">$</span> pnpm test validate
                  </div>
                  <div className="sd-line sd-ok" data-on={s.tests >= 1 || undefined}>
                    ✓ validate.spec.ts (12)
                  </div>
                  <div className="sd-line sd-pass" data-on={s.tests >= 2 || undefined}>
                    12 passed in 1.8s
                  </div>
                </div>

                <div className="sd-pane sd-diff" data-on={s.tab === 2 || undefined}>
                  <div className="sd-file">src/checkout/validate.ts</div>
                  <Code lines={DIFF} start={14} count={s.diff} />
                </div>
              </div>
            </div>
          </div>
        </Window>
      )}
    </LandingStage>
  );
}
