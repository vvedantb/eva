import { IconArrowUp, IconChevronDown } from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  DUR,
  EASE,
  LEAVE,
  MaskedText,
  Sheen,
} from "../../_components/motion";
import { FriTyped, FriWindow } from "../_parts/FriMock";

/**
 * Step 1, in order: the control folds away, the sentence is typed into the
 * box, it is sent up into the conversation, and the Plan tab arrives on its own.
 */
const TYPE_AT = 0.3;
const TYPE_FOR = 0.7;
const SEND_AT = 1.15;
const TAB_AT = 1.7;

const PHRASE = "Plan this first";

/** The control that used to sit above the prompt box. */
function PlanDropdown({ asked }: { asked: boolean }) {
  return (
    <m.div
      className="absolute flex items-center gap-2.5 rounded-[14px] bg-white/[0.08] px-4 py-3 text-[15px] text-white/70 ring-1 ring-white/10"
      initial={{ opacity: 0, y: 10 }}
      animate={
        asked
          ? { opacity: 0, y: -10, scale: 0.9 }
          : { opacity: 1, y: 0, scale: 1 }
      }
      transition={
        asked
          ? { duration: DUR.base, ease: EASE.in }
          : { duration: DUR.slow, ease: EASE.expo, delay: 0.5 }
      }
    >
      <span className="text-white/45">Mode</span>
      <span>Plan</span>
      <IconChevronDown size={16} className="text-white/40" />
    </m.div>
  );
}

/** What replaced it: the same request, sent up from the box as a sentence. */
function PlanBubble({ asked }: { asked: boolean }) {
  return (
    <m.div
      className="absolute rounded-[16px] bg-[#8B3FB8]/20 px-5 py-3.5 text-xl text-white/90"
      initial={{ opacity: 0, y: 92, scale: 0.72 }}
      animate={
        asked
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: 92, scale: 0.72 }
      }
      transition={
        asked
          ? {
              duration: DUR.hero,
              ease: EASE.expo,
              delay: SEND_AT,
              opacity: { duration: DUR.fast, delay: SEND_AT },
            }
          : LEAVE
      }
    >
      {PHRASE}
    </m.div>
  );
}

/** The prompt box: placeholder, the typed sentence, and the send button. */
function PromptBox({ asked }: { asked: boolean }) {
  const typed = asked ? { opacity: [1, 1, 0] } : { opacity: 0 };
  return (
    <div className="mt-auto flex h-11 items-center rounded-full bg-white/[0.06] pr-1.5 pl-4 text-[13px]">
      <div className="relative flex-1">
        <m.span
          className="text-white/35"
          animate={{ opacity: asked ? [0, 0, 1] : 1 }}
          transition={
            asked
              ? { duration: SEND_AT + 0.4, times: [0, 0.8, 1] }
              : { duration: DUR.fast }
          }
        >
          Ask Eva
        </m.span>
        <m.span
          className="absolute inset-y-0 left-0 flex items-center text-white/90"
          initial={{ opacity: 0 }}
          animate={typed}
          transition={
            asked ? { duration: SEND_AT, times: [0, 0.94, 1] } : LEAVE
          }
        >
          <FriTyped
            text={PHRASE}
            run={asked}
            delay={TYPE_AT}
            duration={TYPE_FOR}
            caret={false}
          />
        </m.span>
      </div>
      <span className="relative flex size-8 items-center justify-center overflow-hidden rounded-full bg-white/[0.1] text-white/70">
        <m.span
          aria-hidden
          className="absolute inset-0"
          style={{ background: BRAND_GRADIENT }}
          initial={{ opacity: 0 }}
          animate={asked ? { opacity: [0, 1, 0] } : { opacity: 0 }}
          transition={
            asked
              ? { duration: 0.8, times: [0, 0.25, 1], delay: SEND_AT - 0.1 }
              : LEAVE
          }
        />
        <IconArrowUp size={15} className="relative" />
      </span>
    </div>
  );
}

const TABS: readonly string[] = ["Chat", "Plan"];

function TabPill({ tab, active }: { tab: string; active: boolean }) {
  return (
    <span
      className={cn(
        "block rounded-[10px] px-3 py-1.5 text-[13px]",
        active ? "bg-white/[0.12] text-white" : "bg-white/[0.05] text-white/50",
      )}
    >
      {tab}
    </span>
  );
}

function TabStrip({ asked }: { asked: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {TABS.map((tab, index) => {
        const isPlan = index === 1;
        const shown = !isPlan || asked;
        return (
          <m.span
            key={tab}
            initial={isPlan ? { opacity: 0, x: -12, scale: 0.9 } : false}
            animate={{
              opacity: shown ? 1 : 0,
              x: shown ? 0 : -12,
              scale: shown ? 1 : 0.9,
            }}
            transition={
              asked && isPlan
                ? { duration: DUR.slow, ease: EASE.expo, delay: TAB_AT }
                : LEAVE
            }
          >
            {isPlan ? (
              <Sheen step={1} delay={TAB_AT + 0.25} className="rounded-[10px]">
                <TabPill tab={tab} active />
              </Sheen>
            ) : (
              <TabPill tab={tab} active={false} />
            )}
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
        <Kicker>Using Eva · Plans</Kicker>
        <Title size="md">Ask for a plan first.</Title>
      </Reveal>

      <Reveal delay={0.1} className="mt-12 flex justify-center">
        <FriWindow
          label="Session"
          className="h-[240px] w-[620px]"
          bodyClassName="flex flex-col gap-6 px-6 py-5"
          trailing={<TabStrip asked={asked} />}
        >
          <div className="relative flex min-h-[96px] items-center justify-center">
            <PlanDropdown asked={asked} />
            <PlanBubble asked={asked} />
          </div>
          <PromptBox asked={asked} />
        </FriWindow>
      </Reveal>

      <p className="mt-11 text-center text-3xl text-white/85">
        <MaskedText step={1} delay={TAB_AT + 0.2}>
          No setting. <Accent>Just ask.</Accent>
        </MaskedText>
      </p>

      <Footnote>The plan mode control was removed on 23 August 2026.</Footnote>
    </Shell>
  );
}
