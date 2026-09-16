import { IconRobot, IconShieldLock, IconUserCheck } from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import {
  Accent,
  Body,
  Card,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";

/** The old way: a person reads every line of every change. */
const BEFORE_ROWS = [
  "A person reads every line",
  "Comments back and forth",
  "Days waiting for a reviewer",
  "Small bugs still slip through",
  "Big mistakes get the same attention as small ones",
];

/** What the model now does on its own, before anyone looks. */
const MODEL_PILLS = [
  "Reads the whole change",
  "Finds ordinary bugs",
  "Suggests the fix",
  "Runs the checks",
];

/** The small class of changes that are hard to undo. */
const HUMAN_PILLS = [
  "Database and data structure changes",
  "Deleting or migrating data",
  "Payments, permissions and access",
  "Anything hard to roll back",
];

const LANE_LABEL = "text-[12px] tracking-[0.2em] text-white/40 uppercase";

function Pill({ children }: { children: string }) {
  return (
    <StaggerItem className="rounded-full bg-white/[0.07] px-3 py-1 text-[13px] text-white/80">
      {children}
    </StaggerItem>
  );
}

export function Slide10CodeReviews() {
  const step = useDeckStep();
  const retired = step >= 1;

  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Code reviews</Kicker>
        <Title size="md">Let the model find the bugs.</Title>
        <Body className="mt-4 max-w-4xl text-lg">
          Reviewing every change by hand was the slowest step. Now the model
          does the first read, and people guard the few things that are hard to
          undo.
        </Body>
      </Reveal>

      <div className="mt-6 flex items-stretch gap-12">
        <m.div
          className="w-[520px]"
          initial={{ opacity: 1 }}
          animate={{ opacity: retired ? 0.4 : 1 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        >
          <Card className="h-full p-5">
            <div className={LANE_LABEL}>Before</div>
            <ul className="mt-4 space-y-2.5">
              {BEFORE_ROWS.map((row) => (
                <li key={row} className="flex items-center gap-3 text-white/60">
                  <IconUserCheck size={18} className="shrink-0" />
                  <span
                    className={cn(
                      "text-[15px] leading-snug",
                      retired && "line-through decoration-white/30",
                    )}
                  >
                    {row}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </m.div>

        <Reveal step={1} className="w-[520px]" from="right">
          <Card className="flex h-full flex-col gap-4 p-5">
            <div className={LANE_LABEL}>Now</div>

            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-white/85">
                <IconRobot size={18} />
                The model reviews
              </div>
              <Stagger
                step={1}
                staggerChildren={0.06}
                className="mt-3 flex flex-wrap gap-2"
              >
                {MODEL_PILLS.map((pill) => (
                  <Pill key={pill}>{pill}</Pill>
                ))}
              </Stagger>
            </div>

            {/* Structural marker: the guarded lane is visually set apart. */}
            <div className="relative pl-4">
              <span
                aria-hidden
                className="absolute top-0 bottom-0 left-0 w-[2px] rounded-full bg-gradient-to-b from-[#8B3FB8] to-[#3B7DD8]"
              />
              <div className="flex items-center gap-2 text-sm font-medium text-white/85">
                <IconShieldLock size={18} />
                People guard the irreversible
              </div>
              <Stagger
                step={2}
                staggerChildren={0.06}
                className="mt-3 flex flex-wrap gap-2"
              >
                {HUMAN_PILLS.map((pill) => (
                  <Pill key={pill}>{pill}</Pill>
                ))}
              </Stagger>
            </div>
          </Card>
        </Reveal>
      </div>

      <Reveal step={3} className="mt-6">
        <p className="text-xl text-white/85">
          The question is no longer <Accent>is this perfect</Accent>, it is{" "}
          <Accent>can we undo it</Accent>.
        </p>
      </Reveal>

      <Footnote>
        The nightly Find critical bugs and Code quality review routines and the
        auto-merge flow (slide 6) are the mechanics behind this.
      </Footnote>
    </Shell>
  );
}
