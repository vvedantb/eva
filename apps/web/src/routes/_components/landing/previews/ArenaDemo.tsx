import { IconCheck, IconCircleXFilled } from "@tabler/icons-react";
import {
  Badge,
  Check,
  Collapse,
  Count,
  Row,
  Spinner,
  States,
  Window,
  type Act,
} from "@/lib/stageshow";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./ArenaDemo.css";

// Testing Arena: the code checked against a spec. Beats: the requirements of
// checkout-rework.md are checked one by one, each passing or failing; every
// failure opens as a gap in the list beside it, slotted in by severity (the
// critical one lands above the minor one found first); then the visitor
// turns the top gap into a task in one click (the payoff).
//
// Real strings: the document, the six requirements, the met count, the
// three gaps with their severities, and the Create task button.

type Severity = "critical" | "major" | "minor";

interface Requirement {
  id: string;
  text: string;
  gap?: { title: string; severity: Severity };
}

/** In the document's order: the order they are checked. */
const REQUIREMENTS: readonly Requirement[] = [
  { id: "1.2", text: "Saved addresses" },
  {
    id: "2.4",
    text: "Error copy matches the spec",
    gap: { title: "Error copy differs from the spec", severity: "minor" },
  },
  { id: "3.1", text: "Postcode validation" },
  {
    id: "3.2",
    text: "Guest checkout",
    gap: { title: "Guest checkout is missing", severity: "critical" },
  },
  {
    id: "5.1",
    text: "Retry on payment timeout",
    gap: { title: "No retry on payment timeout", severity: "major" },
  },
  { id: "6.1", text: "Order confirmation email" },
];

const RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };

const SEVERITY: Record<
  Severity,
  { label: string; tone: "danger" | "warning" | "neutral" }
> = {
  critical: { label: "Critical", tone: "danger" },
  major: { label: "Major", tone: "warning" },
  minor: { label: "Minor", tone: "neutral" },
};

/** The gaps as the list shows them: most severe first. */
const GAPS = REQUIREMENTS.flatMap((req, index) =>
  req.gap ? [{ ...req.gap, id: req.id, index }] : [],
).toSorted((a, b) => RANK[a.severity] - RANK[b.severity]);

/**
 * The phone column has room for two gaps: it keeps the two most severe, and
 * the minor one is only in the wide design.
 */
const COMPACT_GAPS = GAPS.slice(0, 2);

type Task = "idle" | "busy" | "done";

type S = {
  /** Requirements checked so far, in order; the next one is being checked. */
  checked: number;
  scanning: boolean;
  task: Task;
};

const initial: S = { checked: 0, scanning: false, task: "idle" };
const poster: S = {
  checked: REQUIREMENTS.length,
  scanning: false,
  task: "done",
};

const met = (checked: number) =>
  REQUIREMENTS.slice(0, checked).filter((req) => !req.gap).length;

async function story(a: Act<S>) {
  await a.wait(500);
  a.mark("scan");
  await a.set({ scanning: true });
  for (const req of REQUIREMENTS) {
    await a.wait(520);
    await a.set((s) => ({
      checked: s.checked + 1,
      scanning: s.checked + 1 < REQUIREMENTS.length,
    }));
    await a.wait(req.gap ? 520 : 180);
  }
  await a.wait(500);

  a.mark("task");
  await a.click({ at: "create-task", x: 0.8, y: 0.6 });
  await a.set({ task: "busy" });
  await a.wait(800);

  a.mark("payoff");
  await a.set({ task: "done" });
  await a.move({ at: "create-task", x: 2.2, y: 0.5 });
  await a.wait(2000);
}

function Status({ index, s }: { index: number; s: S }) {
  const done = index < s.checked;
  const failed = done && REQUIREMENTS[index].gap !== undefined;
  return (
    <States
      value={failed ? "fail" : "check"}
      states={{
        check: (
          <Check
            on={done && !failed}
            pending={s.scanning && index === s.checked}
            size={16}
          />
        ),
        fail: <IconCircleXFilled size={20} className="ar-fail" aria-hidden />,
      }}
    />
  );
}

export function ArenaDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="ar"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
      cursor={{ wide: { x: 560, y: 330 }, compact: { x: 280, y: 410 } }}
    >
      {(s, _rect, layout) => {
        const shown = layout === "compact" ? COMPACT_GAPS : GAPS;
        return (
          <Window title="checkout-rework.md" lights="grey" className="ar-win">
            <div className="ar-body">
              <div className="ar-reqs">
                <div className="ar-head">
                  <span>Requirements</span>
                  <span className="ar-score">
                    <Count value={met(s.checked)} />
                    <span>of {REQUIREMENTS.length} met</span>
                  </span>
                </div>
                {REQUIREMENTS.map((req, i) => (
                  <Row
                    key={req.id}
                    className="ar-req"
                    pad={layout === "compact" ? 5 : 12}
                    data-on={i < s.checked || undefined}
                    lead={
                      <span className="ar-status">
                        <Status index={i} s={s} />
                      </span>
                    }
                    title={<span className="ar-req-text">{req.text}</span>}
                  >
                    <span className="ar-id">{req.id}</span>
                  </Row>
                ))}
              </div>

              <div className="ar-gaps">
                <div className="ar-head">
                  <span>Gaps</span>
                </div>
                <Collapse open={shown.every((gap) => gap.index >= s.checked)}>
                  <div className="ar-empty">No gaps found yet</div>
                </Collapse>
                {shown.map((gap, rank) => {
                  const severity = SEVERITY[gap.severity];
                  const top = rank === 0;
                  return (
                    <Collapse
                      key={gap.id}
                      open={gap.index < s.checked}
                      reveal="drop"
                    >
                      <div className="ar-gap" data-top={top || undefined}>
                        <div className="ar-gap-main">
                          <div className="ar-gap-text">
                            <span className="ar-gap-title">{gap.title}</span>
                            <span className="ar-gap-ref">
                              Requirement {gap.id}
                            </span>
                          </div>
                          <Badge tone={severity.tone}>{severity.label}</Badge>
                        </div>
                        {top && (
                          <span
                            className="ar-create"
                            data-target="create-task"
                            data-cursor="pointer"
                            data-state={s.task}
                          >
                            <States
                              value={s.task}
                              states={{
                                idle: <span>Create task</span>,
                                busy: <Spinner size={13} />,
                                done: (
                                  <span className="ar-created">
                                    <IconCheck
                                      size={14}
                                      stroke={2.25}
                                      aria-hidden
                                    />
                                    Task created
                                  </span>
                                ),
                              }}
                            />
                          </span>
                        )}
                      </div>
                    </Collapse>
                  );
                })}
              </div>
            </div>
          </Window>
        );
      }}
    </LandingStage>
  );
}
