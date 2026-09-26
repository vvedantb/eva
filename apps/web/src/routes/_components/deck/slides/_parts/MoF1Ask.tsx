import { IconArrowUp } from "@tabler/icons-react";
import { m } from "motion/react";
import { useDeckStep } from "../../_components/DeckPrimitives";
import {
  BRAND,
  BRAND_GRADIENT,
  DUR,
  EASE,
  LEAVE,
} from "../../_components/motion";
import { FriTyped, FriWindow } from "./FriMock";

/** The one thing the room types. Short enough to sit on a single line. */
const ASK = "Add a decline reason to referrals";
/** When the typed line finishes, the send button answers. */
const SENT_AT = 1.8;

export function MoF1AskPanel() {
  return (
    <FriWindow
      label="Chat"
      className="h-full w-full"
      bodyClassName="flex flex-col"
    >
      <div className="rounded-[12px] bg-[#8B3FB8]/20 px-3 py-2.5 text-[13px] leading-snug text-white/90">
        <FriTyped text={ASK} delay={0.4} duration={1.3} />
      </div>
      <div className="mt-auto flex h-10 items-center rounded-full bg-white/[0.06] pr-1 pl-3">
        <span className="flex-1 text-[12px] text-white/35">Ask Eva</span>
        <span className="relative flex size-8 items-center justify-center rounded-full bg-white/[0.12] text-white/70">
          <m.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ background: BRAND_GRADIENT }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.35] }}
            transition={{
              duration: 1.2,
              times: [0, 0.2, 1],
              delay: SENT_AT,
            }}
          />
          <m.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ border: `1.5px solid ${BRAND.blue}` }}
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 0.8, 0], scale: [1, 2.2] }}
            transition={{ duration: 0.9, ease: EASE.out, delay: SENT_AT }}
          />
          <IconArrowUp size={15} className="relative" />
        </span>
      </div>
    </FriWindow>
  );
}

const BUILD_ROWS: readonly string[] = [
  "Referral form",
  "Decline reasons",
  "Tests",
];
/** Rows complete in sequence across the bar's run. */
const ROW_GAP = 0.42;
const BUILD_START = 0.35;
const BUILD_RUN = 1.6;

/** A tick that draws itself inside a ring, like a job completing. */
function Tick({ on, delay }: { on: boolean; delay: number }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
      <m.circle
        cx={8}
        cy={8}
        r={7}
        stroke={BRAND.blue}
        strokeOpacity={0.45}
        strokeWidth={1.3}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: on ? 1 : 0 }}
        transition={
          on ? { duration: DUR.slow, ease: EASE.inOut, delay } : LEAVE
        }
      />
      <m.path
        d="M4.8 8.3 L7 10.4 L11.2 5.9"
        stroke={BRAND.blue}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: on ? 1 : 0 }}
        transition={
          on
            ? { duration: DUR.base, ease: EASE.out, delay: delay + 0.35 }
            : LEAVE
        }
      />
    </svg>
  );
}

export function MoF1BuildPanel() {
  const running = useDeckStep() >= 1;
  return (
    <FriWindow
      label="Cloud workspace"
      className="h-full w-full"
      bodyClassName="flex flex-col gap-3"
    >
      {BUILD_ROWS.map((row, index) => {
        const at = BUILD_START + index * ROW_GAP;
        return (
          <m.div
            key={row}
            className="flex items-center gap-2.5 rounded-[12px] bg-white/[0.05] px-3 py-2 text-[12px] text-white/70"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: running ? 1 : 0, x: running ? 0 : -12 }}
            transition={
              running
                ? { duration: DUR.slow, ease: EASE.expo, delay: at }
                : LEAVE
            }
          >
            <Tick on={running} delay={at} />
            {row}
          </m.div>
        );
      })}
      <div className="relative mt-auto">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <m.div
            className="h-full origin-left rounded-full"
            style={{ background: BRAND_GRADIENT }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: running ? 1 : 0 }}
            transition={
              running
                ? { duration: BUILD_RUN, ease: EASE.inOut, delay: BUILD_START }
                : LEAVE
            }
          />
        </div>
        {/* The light on the bar's tip rides the same tween as the fill. */}
        <m.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1.5"
          initial={{ x: "-100%" }}
          animate={{ x: running ? "0%" : "-100%" }}
          transition={
            running
              ? { duration: BUILD_RUN, ease: EASE.inOut, delay: BUILD_START }
              : LEAVE
          }
        >
          <m.span
            className="absolute top-1/2 right-0 size-6 translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle closest-side, #fff 0 16%, rgba(130,170,255,0.5) 40%, transparent)",
            }}
            initial={{ opacity: 0 }}
            animate={running ? { opacity: [0, 1, 1, 0] } : { opacity: 0 }}
            transition={
              running
                ? {
                    duration: BUILD_RUN + 0.3,
                    times: [0, 0.08, 0.85, 1],
                    delay: BUILD_START,
                  }
                : LEAVE
            }
          />
        </m.div>
      </div>
    </FriWindow>
  );
}
