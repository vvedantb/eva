import {
  IconCheck,
  IconEye,
  IconLock,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  Collapse,
  Facepile,
  Field,
  States,
  Tabs,
  Window,
  type Act,
} from "@/lib/stageshow";
import { LandingStage, type LandingDemoProps } from "./LandingStage";
import "./TeamsDemo.css";

// A team's environment variables. Beats: Add opens a new row under the
// table; the key is typed; the value is typed and shows only as dots; Save
// turns the inputs into a row like the others, locked and masked (the
// payoff). The team's tabs and members frame it as a shared workspace.
//
// Real strings: the team, the tabs, the section and its note, the four
// keys. Values are never shown, only their mask.

const TABS = {
  wide: ["Activity", "Members", "Codebases", "Env variables"],
  compact: ["Members", "Codebases", "Env variables"],
} as const;

const KEYS = ["ANTHROPIC_API_KEY", "DATABASE_URL", "RESEND_API_KEY"];
const NEW_KEY = "STRIPE_SECRET_KEY";
const MASK = "•".repeat(12);
/** Typed into a password field, so only its length is ever drawn. */
const TYPED_VALUE = "x".repeat(MASK.length);

const REST = {
  wide: { x: 470, y: 372 },
  compact: { x: 250, y: 410 },
};

type Focus = "none" | "key" | "value";

type S = {
  adding: boolean;
  key: string;
  secret: string;
  focus: Focus;
  saved: boolean;
};

const initial: S = {
  adding: false,
  key: "",
  secret: "",
  focus: "none",
  saved: false,
};

const poster: S = {
  adding: true,
  key: NEW_KEY,
  secret: TYPED_VALUE,
  focus: "none",
  saved: true,
};

async function story(a: Act<S>) {
  await a.wait(800);

  a.mark("add");
  await a.click({ at: "add", x: 0.7, y: 0.6 });
  await a.set({ adding: true, focus: "key" });
  await a.wait(500);

  a.mark("key");
  await a.type("key", NEW_KEY, { interval: 55 });
  await a.wait(400);

  a.mark("value");
  await a.click({ at: "value", x: 0.55, y: 0.6 });
  await a.set({ focus: "value" });
  await a.type("secret", TYPED_VALUE, { interval: 60 });
  await a.wait(450);

  a.mark("save");
  await a.click({ at: "save", x: 0.5, y: 0.55 });
  await a.set({ focus: "none", saved: true });

  a.mark("payoff");
  // Off the row's new actions, so the saved row reads whole.
  await a.wait(350);
  await a.move(a.layout === "wide" ? REST.wide : REST.compact);
  await a.wait(1900);
}

function SavedActions() {
  return (
    <>
      <IconEye size={16} />
      <IconPencil size={16} />
      <IconTrash size={16} />
    </>
  );
}

export function TeamsDemo({ onEnd }: LandingDemoProps) {
  return (
    <LandingStage
      className="tm"
      initial={initial}
      poster={poster}
      story={story}
      onEnd={onEnd}
      cursor={REST}
    >
      {(s, _rect, layout) => {
        const tabs = TABS[layout];
        return (
          <Window title="Acme" lights="grey" className="tm-win">
            <div className="tm-body">
              <div className="tm-top">
                <Tabs
                  className="tm-tabs"
                  items={[...tabs]}
                  value={tabs.length - 1}
                />
                <Facepile
                  className="tm-members"
                  names={["Riya", "Jonas", "Ada"]}
                  size={24}
                />
              </div>

              <div className="tm-section">
                <div className="tm-section__text">
                  <div className="tm-section__title">Environment variables</div>
                  <div className="tm-section__note">
                    Encrypted at rest, decrypted only inside your sandboxes.
                  </div>
                </div>
                <span
                  className="tm-add"
                  data-target="add"
                  data-cursor="pointer"
                  data-off={(s.adding && !s.saved) || undefined}
                >
                  <IconPlus size={14} />
                  Add
                </span>
              </div>

              <div className="tm-table">
                <div className="tm-row tm-row--head">
                  <span>Key</span>
                  <span>Value</span>
                </div>
                {KEYS.map((key) => (
                  <div key={key} className="tm-row">
                    <span className="tm-key">{key}</span>
                    <span className="tm-value">
                      <IconLock size={14} className="tm-lock" />
                      <span className="tm-mask">{MASK}</span>
                    </span>
                    <span className="tm-actions">
                      <SavedActions />
                    </span>
                  </div>
                ))}
                <Collapse open={s.adding}>
                  <div
                    className="tm-row tm-new"
                    data-saved={s.saved || undefined}
                  >
                    <Field
                      className="tm-field tm-field--key"
                      value={s.key}
                      focused={s.focus === "key"}
                      placeholder="e.g. API_KEY"
                    />
                    <span className="tm-value">
                      <IconLock size={14} className="tm-lock tm-lock--new" />
                      <Field
                        className="tm-field"
                        value={s.secret}
                        password
                        focused={s.focus === "value"}
                        placeholder="Enter value"
                        box={{ "data-target": "value" }}
                      />
                    </span>
                    <span className="tm-actions">
                      <States
                        align="end"
                        value={s.saved ? "saved" : "editing"}
                        states={{
                          editing: (
                            <span className="tm-edit">
                              <span
                                className="tm-icon tm-icon--save"
                                data-target="save"
                                data-cursor="pointer"
                              >
                                <IconCheck size={16} />
                              </span>
                              <span className="tm-icon">
                                <IconX size={16} />
                              </span>
                            </span>
                          ),
                          saved: (
                            <span className="tm-edit tm-edit--saved">
                              <SavedActions />
                            </span>
                          ),
                        }}
                      />
                    </span>
                  </div>
                </Collapse>
              </div>
            </div>
          </Window>
        );
      }}
    </LandingStage>
  );
}
