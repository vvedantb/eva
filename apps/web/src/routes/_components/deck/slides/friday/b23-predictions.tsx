import type { Icon } from "@tabler/icons-react";
import {
  IconArrowUp,
  IconChevronDown,
  IconHandStop,
  IconHourglassEmpty,
  IconMessages,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { Message, MessageContent, ProviderIcon, cn } from "@eva/ui";
import {
  useAppScheme,
  Accent,
  BRAND,
  Footnote,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  DUR,
  EASE,
  Pulse,
  Spotlight,
  cueTransition,
} from "../../_components/motion";
import { Fri2Chip } from "../_parts/Fri2Chip";

const GHOST = 1;
const ACCEPT = 2;
const RULES = 3;

const W = 1088;
const CHAT_W = 760;
const CHAT_X = (W - CHAT_W) / 2;
const H = 290;

/** Example chat. The prediction is the kind of reply the model suggests. */
const ASK = "The export shows the wrong date.";
const REPLY =
  "Fixed. Exports now convert to the user's time zone before the date is written, and the export tests pass.";
const PREDICTION = "Add a test for other time zones, then open a pull request";

interface Rule {
  icon: Icon;
  label: string;
}

const RULES_LIST: readonly Rule[] = [
  { icon: IconHourglassEmpty, label: "Only when Eva is waiting on you" },
  { icon: IconMessages, label: "Reads the recent conversation" },
  { icon: IconHandStop, label: "Never sends on its own" },
];

const SHOTS: readonly CameraShot[] = [
  { rotateX: 8, translateZ: -40 },
  { rotateX: 4, translateZ: 10 },
  { rotateX: 2, translateZ: 22 },
  { translateZ: -30 },
];

const GLOW = [
  { x: W / 2, y: 120, size: 620 },
  { x: W / 2, y: H - 40, size: 560 },
  { x: W / 2, y: H - 40, size: 640 },
  { x: W / 2, y: H / 2, size: 900 },
];

/** The keycap the presenter's audience should look at. Dips when pressed. */
function TabKey() {
  const step = useDeckStep();
  const shown = step >= GHOST;
  const pressed = step >= ACCEPT;

  return (
    <m.div
      className="absolute flex items-center gap-2"
      style={{ left: CHAT_X + CHAT_W + 20, top: H - 72 }}
      initial={{ opacity: 0, x: -10 }}
      animate={shown ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
      transition={cueTransition(shown, 0.7, {
        duration: DUR.slow,
        ease: EASE.expo,
      })}
    >
      <m.span
        className="relative flex h-11 min-w-[64px] items-center justify-center rounded-xl bg-white/[0.1] px-3 text-base font-semibold text-white ring-1 ring-white/20 ring-inset"
        style={{ boxShadow: "0 3px 0 rgba(255,255,255,0.18)" }}
        animate={
          pressed
            ? {
                y: [0, 3, 0],
                boxShadow: [
                  "0 3px 0 rgba(255,255,255,0.18)",
                  "0 0 0 rgba(255,255,255,0.18)",
                  "0 3px 0 rgba(255,255,255,0.18)",
                ],
              }
            : { y: 0 }
        }
        transition={
          pressed
            ? { duration: 0.35, times: [0, 0.4, 1], delay: 0.4 }
            : { duration: DUR.fast }
        }
      >
        Tab
        {shown && !pressed ? (
          <span className="absolute -top-1 -right-1">
            <Pulse color={BRAND.blue} size={7} step={GHOST} delay={1} />
          </span>
        ) : null}
      </m.span>
    </m.div>
  );
}

/** The composer: placeholder, then grey prediction, then accepted text. */
function Composer() {
  const step = useDeckStep();
  const ghost = step >= GHOST;
  const accepted = step >= ACCEPT;
  const at = step === GHOST ? 0.45 : 0;

  return (
    <div className="p-3">
      <m.div
        className="border-input relative flex h-14 items-center rounded-full border bg-card py-1 pr-1.5 pl-4"
        animate={{
          boxShadow: accepted
            ? `0 0 0 3px ${BRAND.blue}40`
            : "0 0 0 0px rgba(0,0,0,0)",
        }}
        transition={cueTransition(accepted, 0.5, { duration: DUR.base })}
      >
        <span className="relative min-w-0 flex-1 truncate text-base">
          {/* Placeholder until a prediction arrives. */}
          <m.span
            className="absolute inset-0 truncate text-muted-foreground"
            initial={false}
            animate={{ opacity: ghost ? 0 : 1 }}
            transition={cueTransition(ghost, at, { duration: DUR.fast })}
          >
            Ask Eva to build something...
          </m.span>
          {/* The prediction: ghost text, solid once Tab accepts it. */}
          <m.span
            className={cn(
              "block truncate",
              accepted ? "text-foreground" : "text-muted-foreground/50",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: ghost ? 1 : 0 }}
            transition={cueTransition(ghost, at + 0.05, {
              duration: DUR.base,
            })}
          >
            {PREDICTION}
            {accepted ? (
              <m.span
                aria-hidden
                className="ml-px inline-block h-5 w-px translate-y-[4px] bg-foreground"
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  times: [0, 0.5, 0.5, 1],
                  delay: 0.5,
                }}
              />
            ) : null}
          </m.span>
        </span>
        <m.span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          animate={{ scale: accepted ? [1, 1.12, 1] : 1 }}
          transition={
            accepted
              ? { duration: 0.45, times: [0, 0.4, 1], delay: 0.6 }
              : { duration: DUR.fast }
          }
        >
          <IconArrowUp className="size-4" />
        </m.span>
      </m.div>
      <div className="mx-auto flex w-[calc(100%-1.5rem)] items-center gap-0.5 rounded-b-surface bg-muted/70 px-2 py-0.5">
        <div className="ml-auto flex h-7 items-center gap-1.5 px-2 text-xs text-muted-foreground">
          <ProviderIcon provider="claude" size={14} />
          <span>Fable 5.1</span>
          <IconChevronDown className="size-3" />
        </div>
      </div>
    </div>
  );
}

function Chat() {
  const appScheme = useAppScheme();
  const step = useDeckStep();
  return (
    <m.div
      className={cn(
        appScheme,
        "absolute top-0 flex flex-col overflow-hidden rounded-2xl bg-background ring-1 ring-white/10",
      )}
      style={{ left: CHAT_X, width: CHAT_W, height: H }}
      animate={{ opacity: step >= RULES ? 0.55 : 1 }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      <div className="flex flex-1 flex-col justify-end gap-4 px-5 pt-5">
        <Message from="user">
          <MessageContent className="rounded-surface bg-primary/10 px-3 py-2 text-base text-foreground group-[.is-user]:bg-primary/10">
            {ASK}
          </MessageContent>
        </Message>
        <m.div
          className="text-base leading-relaxed text-foreground/90"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.slow, ease: EASE.out, delay: 0.5 }}
        >
          {REPLY}
        </m.div>
      </div>
      <Composer />
    </m.div>
  );
}

function Rules() {
  const shown = useDeckStep() >= RULES;
  return (
    <m.div
      className="mt-6 flex justify-center gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: shown ? 1 : 0 }}
      transition={cueTransition(shown, 0.15, { duration: DUR.base })}
    >
      {RULES_LIST.map((rule, index) => (
        <Fri2Chip
          key={rule.label}
          icon={rule.icon}
          label={rule.label}
          lit={shown}
          index={index}
          delay={0.3 + index * 0.12}
        />
      ))}
    </m.div>
  );
}

export function FridayPredictions() {
  return (
    <Shell className="py-14">
      <Title size="md">
        Your next message, <Accent>one Tab away</Accent>.
      </Title>

      <Camera shots={SHOTS} className="mt-8">
        <div className="relative isolate" style={{ width: W, height: H }}>
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />
          <Chat />
          <TabKey />
        </div>
      </Camera>

      <Rules />

      <Footnote>
        Composer predictions, an experimental setting since 10 October 2026. The
        chat and the suggestion shown are an example.
      </Footnote>
    </Shell>
  );
}
