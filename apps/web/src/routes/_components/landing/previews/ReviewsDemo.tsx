import { IconPinnedFilled, IconPlus } from "@tabler/icons-react";
import {
  Badge,
  Bar,
  Code,
  Collapse,
  Spinner,
  Stream,
  Window,
  type Act,
} from "@/lib/stageshow";
import { BrandMark } from "../BrandMark";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./ReviewsDemo.css";

// Reviews: a pull request in Eva. Beats: the recap writes itself into the
// pinned comment; the visitor opens a comment on the changed line and types
// what is still wrong; Send to agent hands it over, and the same comment
// shows Claude Code fixing it (the payoff).
//
// Real strings: the pull request title and branch, the recap, the diff, the
// review comment and the agent's status. Older comments are bars.

const RECAP =
  "Trims spaces before the postcode check, so a pasted postcode passes. One file, tests pass.";
const RECAP_WORDS = RECAP.split(" ").length;

const COMMENT = "Uppercase it too: sw1a 1aa still fails.";

const DIFF_HEAD = [
  "export function isValidPostcode(raw) {",
  { text: "  return POSTCODE.test(raw);", kind: "del" as const },
  { text: "  return POSTCODE.test(raw.trim());", kind: "add" as const },
];
const DIFF_TAIL = ["}"];

/** Filler: earlier comments, and the next file's lines. */
const OLDER: readonly (readonly [number, number])[] = [
  [96, 150],
  [120, 132],
  [84, 140],
];
const NEXT = [180, 132, 210, 96];

type Comment = "closed" | "writing" | "sent";

type S = {
  words: number;
  comment: Comment;
  draft: string;
};

const initial: S = { words: 0, comment: "closed", draft: "" };
const poster: S = { words: RECAP_WORDS, comment: "sent", draft: COMMENT };

async function story(a: Act<S>) {
  await a.wait(400);
  a.mark("recap");
  for (let i = 1; i <= RECAP_WORDS; i++) {
    a.put({ words: i });
    await a.wait(70);
  }
  await a.wait(500);

  a.mark("comment");
  await a.move({ at: "line", x: 0.6, y: 0.5 });
  await a.wait(250);
  await a.click({ at: "add-comment", x: 0.5, y: 0.5 });
  await a.set({ comment: "writing" });
  await a.wait(450);
  await a.type("draft", COMMENT, { interval: 38 });
  await a.wait(400);

  a.mark("send");
  await a.click({ at: "send", x: 0.75, y: 0.6 });
  await a.set({ comment: "sent" });
  await a.move({ at: "send", x: 0.75, y: 2.4 });

  a.mark("payoff");
  await a.wait(2300);
}

export function ReviewsDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="rv"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
      cursor={{ wide: { x: 540, y: 140 }, compact: { x: 290, y: 120 } }}
    >
      {(s) => (
        <Window title="acme/web" lights="grey" className="rv-win">
          <div className="rv-body">
            <div className="rv-head">
              <div className="rv-title">
                Fix checkout postcode validation
                <span className="rv-num">#142</span>
              </div>
              <div className="rv-meta">
                <Badge tone="success">Open</Badge>
                <span className="rv-branch">eva/postcode-space</span>
              </div>
            </div>

            <div className="rv-cols">
              <div className="rv-side">
                <div className="rv-recap">
                  <div className="rv-recap-head">
                    <IconPinnedFilled size={14} aria-hidden />
                    Recap
                  </div>
                  <Stream
                    className="rv-recap-text"
                    text={RECAP}
                    count={s.words}
                  />
                </div>
                {OLDER.map(([name, line], i) => (
                  <div key={i} className="rv-older">
                    <Bar w={22} h={22} r={11} tone={2} />
                    <div className="rv-older-lines">
                      <Bar w={name} h={7} tone={3} />
                      <Bar w={line} h={6} tone={2} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="rv-files">
                <div className="rv-diff">
                  <div className="rv-file">
                    <span>src/checkout/validate.ts</span>
                  </div>
                  <div className="rv-code">
                    <Code lines={DIFF_HEAD} start={14} />
                    <span
                      className="rv-line"
                      data-target="line"
                      data-open={s.comment !== "closed" || undefined}
                    >
                      <span
                        className="rv-add"
                        data-target="add-comment"
                        data-cursor="pointer"
                      >
                        <IconPlus size={12} stroke={2.25} aria-hidden />
                      </span>
                    </span>
                  </div>

                  <Collapse open={s.comment !== "closed"} reveal="drop">
                    <div
                      className="rv-comment"
                      data-sent={s.comment === "sent" || undefined}
                    >
                      <div className="rv-input" data-cursor="ibeam">
                        <span className="rv-draft">
                          {s.draft}
                          <span
                            className="rv-caret"
                            data-on={s.comment === "writing" || undefined}
                          />
                        </span>
                      </div>
                      <div className="rv-foot">
                        <span
                          className="rv-send"
                          data-target="send"
                          data-cursor="pointer"
                          data-on={s.comment !== "sent" || undefined}
                        >
                          Send to agent
                        </span>
                        <span
                          className="rv-fixing"
                          data-on={s.comment === "sent" || undefined}
                        >
                          <BrandMark name="claude" size={14} />
                          Claude Code is fixing this
                          <Spinner size={13} />
                        </span>
                      </div>
                    </div>
                  </Collapse>

                  <Code lines={DIFF_TAIL} start={16} className="rv-tail" />
                </div>

                <div className="rv-diff rv-diff--next">
                  <div className="rv-file">
                    <Bar w={170} h={6} tone={3} />
                  </div>
                  <div className="rv-next-lines">
                    {NEXT.map((w, i) => (
                      <Bar key={i} w={w} h={6} tone={i === 0 ? 3 : 2} />
                    ))}
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
