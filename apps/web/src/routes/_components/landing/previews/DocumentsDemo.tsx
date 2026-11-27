import { IconArrowUp, IconFileText } from "@tabler/icons-react";
import {
  Bar,
  Check,
  Collapse,
  Facepile,
  Field,
  States,
  Stream,
  Window,
  type Act,
} from "@/lib/stageshow";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./DocumentsDemo.css";

// A spec the agent reads. Beats: Riya finishes a requirement in the shared
// doc, her caret and name in her own colour; the visitor asks for the feature
// in the task beside it; the agent reads the doc (a tool row, pending then
// done); its reply quotes the line Riya just wrote (the payoff).
//
// Real strings: the section, the two requirements, Riya, the ask, the read
// row and the reply. The rest of the doc and the earlier turn are bars.

const ASK = "Build guest checkout";
const TYPED = "7 days";
const REPLY =
  "The spec keeps guest baskets for 7 days, so I will add an expiry to the basket table.";
const REPLY_WORDS = REPLY.split(" ").length;

/** Where the pointer waits: clear of the send button and the answer. */
const REST = {
  wide: { x: 560, y: 318 },
  compact: { x: 250, y: 300 },
} as const;

type Read = "idle" | "reading" | "done";

type S = {
  typed: string;
  draft: string;
  focused: boolean;
  sent: boolean;
  read: Read;
  words: number;
};

const initial: S = {
  typed: "",
  draft: "",
  focused: false,
  sent: false,
  read: "idle",
  words: 0,
};

const poster: S = {
  typed: TYPED,
  draft: "",
  focused: false,
  sent: true,
  read: "done",
  words: REPLY_WORDS,
};

async function story(a: Act<S>) {
  await a.wait(600);
  a.mark("riya");
  await a.type("typed", TYPED, { interval: 110 });
  await a.wait(500);

  a.mark("ask");
  await a.click({ at: "composer", x: 0.4, y: 0.5 });
  a.put({ focused: true });
  await a.wait(200);
  await a.type("draft", ASK, { interval: 40 });
  await a.wait(250);
  await a.click({ at: "send", x: 0.5, y: 0.5 });
  await a.set({ sent: true, draft: "", focused: false });
  // Off the button, so the answer has the stage to itself.
  void a.move(REST[a.layout]);
  await a.wait(450);

  a.mark("read");
  a.put({ read: "reading" });
  await a.wait(1200);
  a.put({ read: "done" });
  await a.wait(350);

  a.mark("payoff");
  for (let i = 1; i <= REPLY_WORDS; i++) {
    a.put({ words: i });
    await a.wait(45);
  }
  await a.wait(2200);
}

export function DocumentsDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="dc"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
      cursor={REST}
    >
      {(s) => (
        <Window title="Checkout rework" lights="grey" className="dc-win">
          <div className="dc-body">
            <div className="dc-doc">
              <div className="dc-head">
                <div className="dc-section">Requirements</div>
                <Facepile names={["Riya", "Tom"]} size={22} />
              </div>
              <div className="dc-lines dc-intro">
                <Bar w="94%" h={6} tone={2} />
                <Bar w="72%" h={6} tone={2} />
              </div>
              <ul className="dc-list">
                <li>
                  Guest baskets are kept for{" "}
                  <span className="dc-typed">
                    {s.typed}
                    <span className="dc-caret">
                      <span className="dc-flag">Riya</span>
                    </span>
                  </span>
                </li>
                <li>Guests can check out without an account</li>
                <li className="dc-filler">
                  <Bar w="58%" h={6} tone={2} />
                </li>
              </ul>
              <div className="dc-lines dc-after">
                <Bar w={110} h={7} tone={3} />
                <Bar w="88%" h={6} tone={2} />
                <Bar w="64%" h={6} tone={2} />
                <Bar w="80%" h={6} tone={2} />
                <Bar w="46%" h={6} tone={2} />
              </div>
            </div>

            <div className="dc-task">
              <div className="dc-thread">
                <div className="dc-past">
                  <Bar w={120} h={26} r={13} tone={1} className="dc-past-ask" />
                  <Bar w="90%" h={6} tone={2} className="dc-past-line" />
                  <Bar w="70%" h={6} tone={2} className="dc-past-line" />
                </div>
                <Collapse open={s.sent} reveal="drop" from="below">
                  <div className="dc-ask">{ASK}</div>
                </Collapse>
                <Collapse open={s.read !== "idle"}>
                  <div className="dc-tool">
                    <span className="dc-tool-mark">
                      <Check
                        on={s.read === "done"}
                        pending={s.read === "reading"}
                        size={14}
                      />
                    </span>
                    <IconFileText
                      size={14}
                      stroke={1.75}
                      className="dc-tool-icon"
                      aria-hidden
                    />
                    <States
                      align="start"
                      value={s.read === "done" ? "done" : "reading"}
                      states={{
                        reading: <span>Reading Checkout rework</span>,
                        done: <span>Read Checkout rework</span>,
                      }}
                    />
                  </div>
                </Collapse>
                <Collapse open={s.words > 0}>
                  <Stream className="dc-reply" text={REPLY} count={s.words} />
                </Collapse>
              </div>
              <Field
                className="dc-composer"
                value={s.draft}
                placeholder="Ask Eva"
                focused={s.focused}
                box={{ "data-target": "composer" }}
                trailing={
                  <span
                    className="dc-send"
                    data-target="send"
                    data-cursor="pointer"
                  >
                    <IconArrowUp size={14} stroke={2} aria-hidden />
                  </span>
                }
              />
            </div>
          </div>
        </Window>
      )}
    </LandingStage>
  );
}
