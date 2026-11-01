import {
  IconFileText,
  IconLayoutKanban,
  IconListCheck,
  IconNotes,
} from "@tabler/icons-react";
import {
  Bar,
  Collapse,
  Count,
  Field,
  Roll,
  Spinner,
  States,
  Window,
  type Act,
} from "@/lib/stageshow";
import { BrandMark } from "../BrandMark";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./DraftsDemo.css";

// Somewhere to put an idea. Beats: the visitor writes an idea down and adds
// it, and it drops in at the top of the drafts; they promote it; the draft
// becomes a running task in its own row, with the Tasks icon, its number and
// the agent at work (the payoff); the sidebar counts it out of Drafts and into
// Tasks.
//
// Real strings: the title, the field, the typed idea, the two older drafts,
// Promote, the task it became and the two sidebar counts. Meta lines and the
// rest of the sidebar are bars.

const IDEA = "Retry failed webhooks";

/** Where the pointer waits: below the list, clear of the rows' words. */
const REST = {
  wide: { x: 470, y: 340 },
  compact: { x: 250, y: 400 },
} as const;

type Phase = "draft" | "promoting" | "task";

type S = {
  draft: string;
  focused: boolean;
  added: boolean;
  hover: boolean;
  phase: Phase;
};

const initial: S = {
  draft: "",
  focused: false,
  added: false,
  hover: false,
  phase: "draft",
};

const poster: S = {
  draft: "",
  focused: false,
  added: true,
  hover: false,
  phase: "task",
};

async function story(a: Act<S>) {
  await a.wait(500);
  a.mark("write");
  await a.click({ at: "idea", x: 0.3, y: 0.5 });
  a.put({ focused: true });
  await a.wait(200);
  await a.type("draft", IDEA, { interval: 45 });
  await a.wait(250);
  await a.click({ at: "add", x: 0.6, y: 0.6 });
  await a.set({ added: true, draft: "", focused: false });
  await a.wait(900);

  a.mark("promote");
  await a.move({ at: "new-row", x: 0.5, y: 0.5 });
  a.put({ hover: true });
  await a.wait(350);
  await a.click({ at: "promote", x: 0.75, y: 0.6 });
  a.put({ phase: "promoting" });
  await a.wait(650);

  a.mark("payoff");
  a.put({ phase: "task", hover: false });
  void a.move(REST[a.layout]);
  await a.wait(2400);
}

export function DraftsDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="dr"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
      cursor={REST}
    >
      {(s, _rect, layout) => {
        const promoted = s.phase === "task";
        const drafts = 2 + (s.added ? 1 : 0) - (promoted ? 1 : 0);
        return (
          <Window
            title="Drafts"
            lights="grey"
            className="dr-win"
            sidebarWidth={156}
            sidebar={
              layout === "wide" ? (
                <nav className="dr-nav">
                  <span className="dr-nav-item">
                    <IconListCheck size={16} stroke={1.75} aria-hidden />
                    <span className="dr-nav-label">Tasks</span>
                    <Count
                      className="dr-nav-count"
                      value={12 + (promoted ? 1 : 0)}
                    />
                  </span>
                  <span className="dr-nav-item">
                    <IconLayoutKanban size={16} stroke={1.75} aria-hidden />
                    <Bar w={58} h={6} tone={3} />
                  </span>
                  <span className="dr-nav-item" data-selected>
                    <IconNotes size={16} stroke={1.75} aria-hidden />
                    <span className="dr-nav-label">Drafts</span>
                    <Count className="dr-nav-count" value={drafts} />
                  </span>
                  <span className="dr-nav-item">
                    <IconFileText size={16} stroke={1.75} aria-hidden />
                    <Bar w={66} h={6} tone={3} />
                  </span>
                </nav>
              ) : undefined
            }
          >
            <div className="dr-body">
              <Field
                className="dr-field"
                value={s.draft}
                placeholder="Write down an idea"
                focused={s.focused}
                box={{ "data-target": "idea" }}
                trailing={
                  <span
                    className="dr-add"
                    data-target="add"
                    data-cursor="pointer"
                  >
                    Add
                  </span>
                }
              />

              <div className="dr-list">
                <Collapse open={s.added} reveal="drop">
                  <div
                    className="dr-row"
                    data-target="new-row"
                    data-hover={s.hover || undefined}
                    data-task={promoted || undefined}
                  >
                    <span className="dr-lead">
                      <States
                        value={promoted ? "task" : "draft"}
                        states={{
                          draft: (
                            <IconNotes size={16} stroke={1.75} aria-hidden />
                          ),
                          task: (
                            <IconListCheck
                              size={16}
                              stroke={1.75}
                              aria-hidden
                            />
                          ),
                        }}
                      />
                    </span>
                    <span className="dr-text">
                      <span className="dr-title">{IDEA}</span>
                      <span className="dr-meta">
                        <Roll variant="fade">
                          {promoted ? "Task #143" : "Just now"}
                        </Roll>
                      </span>
                    </span>
                    <span className="dr-end">
                      <span
                        className="dr-promote"
                        data-target="promote"
                        data-cursor="pointer"
                        data-on={
                          (s.hover || s.phase === "promoting") && !promoted
                            ? true
                            : undefined
                        }
                      >
                        <States
                          value={s.phase === "promoting" ? "busy" : "idle"}
                          states={{
                            idle: <span>Promote</span>,
                            busy: <Spinner size={12} />,
                          }}
                        />
                      </span>
                      <span
                        className="dr-running"
                        data-on={promoted || undefined}
                      >
                        <BrandMark name="claude" size={14} />
                        Running
                      </span>
                    </span>
                  </div>
                </Collapse>
                <OldDraft title="Cache the pricing table" meta={92} />
                <OldDraft title="Drop the legacy admin route" meta={70} />
                <FillerDraft title={150} meta={64} />
                <FillerDraft title={118} meta={80} />
              </div>
            </div>
          </Window>
        );
      }}
    </LandingStage>
  );
}

function FillerDraft({ title, meta }: { title: number; meta: number }) {
  return (
    <div className="dr-row dr-filler">
      <span className="dr-lead">
        <IconNotes size={16} stroke={1.75} aria-hidden />
      </span>
      <span className="dr-text">
        <Bar w={title} h={7} tone={3} />
        <Bar w={meta} h={6} tone={2} />
      </span>
    </div>
  );
}

function OldDraft({ title, meta }: { title: string; meta: number }) {
  return (
    <div className="dr-row">
      <span className="dr-lead">
        <IconNotes size={16} stroke={1.75} aria-hidden />
      </span>
      <span className="dr-text">
        <span className="dr-title">{title}</span>
        <span className="dr-meta">
          <Bar w={meta} h={6} tone={2} />
        </span>
      </span>
    </div>
  );
}
