import { IconChevronDown } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import type { Transition } from "motion/react";
import { cn } from "@eva/ui";
import {
  Accent,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { FriTyped, FriWindow } from "../_parts/FriMock";

const SETTLE: Transition = { type: "spring", bounce: 0, duration: 0.55 };

/** The control that used to sit above the prompt box. */
function PlanDropdown() {
  return (
    <m.div
      className="flex items-center gap-2.5 rounded-[14px] bg-white/[0.08] px-4 py-3 text-[15px] text-white/70 ring-1 ring-white/10"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      <span className="text-white/45">Mode</span>
      <span>Plan</span>
      <IconChevronDown size={16} className="text-white/40" />
    </m.div>
  );
}

/** What replaced it: the same request, typed as a sentence. */
function PlanBubble() {
  return (
    <m.div
      className="rounded-[16px] bg-[#8B3FB8]/20 px-5 py-3.5 text-xl text-white/90"
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SETTLE}
    >
      <FriTyped text="Plan this first" delay={0.35} duration={0.8} />
    </m.div>
  );
}

const TABS: readonly string[] = ["Chat", "Plan"];

function TabStrip() {
  const asked = useDeckStep() >= 1;

  return (
    <div className="flex items-center gap-2">
      {TABS.map((tab, index) => {
        const isPlan = index === 1;
        return (
          <m.span
            key={tab}
            className={cn(
              "rounded-[10px] px-3 py-1.5 text-[13px]",
              isPlan
                ? "bg-white/[0.12] text-white"
                : "bg-white/[0.05] text-white/50",
            )}
            initial={isPlan ? { opacity: 0, x: -10, scale: 0.9 } : false}
            animate={
              isPlan
                ? {
                    opacity: asked ? 1 : 0,
                    x: asked ? 0 : -10,
                    scale: asked ? 1 : 0.9,
                  }
                : { opacity: 1 }
            }
            transition={
              asked
                ? { ...SETTLE, delay: isPlan ? 0.5 : 0 }
                : { duration: 0.2, ease: EASE_OUT }
            }
          >
            {tab}
          </m.span>
        );
      })}
    </div>
  );
}

export function FridayPlan() {
  const asked = useDeckStep() >= 1;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Plans</Kicker>
        <Title size="md">Ask for a plan first.</Title>
      </Reveal>

      <Reveal delay={0.1} className="mt-12 flex justify-center">
        <FriWindow
          label="Session"
          className="h-[240px] w-[620px]"
          bodyClassName="flex flex-col gap-6 px-6 py-5"
          trailing={<TabStrip />}
        >
          <div className="flex min-h-[96px] items-center justify-center">
            <AnimatePresence mode="wait" initial={false}>
              {asked ? (
                <PlanBubble key="bubble" />
              ) : (
                <PlanDropdown key="dropdown" />
              )}
            </AnimatePresence>
          </div>
          <div className="mt-auto flex h-11 items-center rounded-full bg-white/[0.06] px-4 text-[13px] text-white/35">
            Ask Eva
          </div>
        </FriWindow>
      </Reveal>

      <Reveal step={1} delay={0.7} className="mt-11 text-center">
        <p className="text-3xl text-white/85">
          No setting. <Accent>Just ask.</Accent>
        </p>
      </Reveal>

      <Footnote>The plan mode control was removed on 23 August 2026.</Footnote>
    </Shell>
  );
}
