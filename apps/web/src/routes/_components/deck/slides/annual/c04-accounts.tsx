import { IconKey, IconUser } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  BRAND,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

/** Three colleagues, left to right. The first one is the sharer. */
const PEOPLE = [0, 1, 2];

const COLUMN_WIDTH = 300;
const COLUMN_GAP = 90;
/** Centre to centre, first colleague to second. */
const SPAN = COLUMN_WIDTH + COLUMN_GAP;

function Person({ index, step }: { index: number; step: number }) {
  const deckStep = useDeckStep();
  const attached = deckStep >= step;
  const sharing = deckStep >= 2 && index === 0;
  const delay = attached ? index * 0.16 : 0;

  return (
    <div className="flex flex-col items-center" style={{ width: COLUMN_WIDTH }}>
      <div className="flex h-[92px] w-[92px] items-center justify-center rounded-full bg-white/[0.07]">
        <IconUser
          size={40}
          stroke={1.4}
          className="text-white/70"
          aria-hidden
        />
      </div>

      <m.div
        className="mt-5 flex h-[42px] items-center gap-2.5 rounded-[14px] bg-white/[0.07] px-4"
        initial={{ opacity: 0, y: -14, scale: 0.9 }}
        animate={
          attached
            ? {
                opacity: 1,
                y: 0,
                scale: 1,
                boxShadow: sharing
                  ? `0 0 0 1px ${BRAND.blue}aa`
                  : "0 0 0 1px rgba(255,255,255,0)",
              }
            : { opacity: 0, y: -14, scale: 0.9 }
        }
        transition={
          attached
            ? { type: "spring", bounce: 0, duration: 0.55, delay }
            : { duration: 0.25, ease: EASE_OUT }
        }
      >
        <IconKey size={17} stroke={1.6} color={BRAND.blue} aria-hidden />
        <span className="text-sm text-white/80">Own account</span>
      </m.div>
    </div>
  );
}

export function AnnualAccounts() {
  const shared = useDeckStep() >= 2;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Accounts</Kicker>
        <Title size="md">Bring your own account.</Title>
      </Reveal>

      <div className="relative mt-16 h-[250px]">
        <div className="flex justify-center" style={{ gap: COLUMN_GAP }}>
          {PEOPLE.map((person) => (
            <Person key={person} index={person} step={1} />
          ))}
        </div>

        {/* Stubs down from each badge, so the link is plainly between these two. */}
        {[-SPAN, 0].map((offset) => (
          <m.div
            key={offset}
            className="absolute top-[154px] h-[30px] w-px origin-top bg-white/25"
            style={{ left: `calc(50% + ${offset}px)` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: shared ? 1 : 0 }}
            transition={{
              duration: shared ? 0.3 : 0.2,
              ease: EASE_OUT,
            }}
            aria-hidden
          />
        ))}

        <m.div
          className="absolute top-[183px] h-[3px] origin-left rounded-full"
          style={{
            left: `calc(50% - ${SPAN}px)`,
            width: SPAN,
            background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})`,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={
            shared ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }
          }
          transition={{
            duration: shared ? 0.7 : 0.25,
            ease: EASE_OUT,
            delay: shared ? 0.25 : 0,
          }}
          aria-hidden
        />

        <m.div
          className="absolute top-[178px] h-[13px] w-[13px] rounded-full bg-white"
          style={{ left: `calc(50% - ${SPAN + 6}px)` }}
          initial={{ x: 0, opacity: 0 }}
          animate={
            shared ? { x: SPAN, opacity: [0, 1, 1, 0] } : { x: 0, opacity: 0 }
          }
          transition={{
            duration: shared ? 1.1 : 0.2,
            ease: EASE_OUT,
            delay: shared ? 0.35 : 0,
          }}
          aria-hidden
        />

        <m.div
          className="absolute top-[204px] -translate-x-1/2 rounded-full bg-white/[0.1] px-4 py-1.5 text-[13px] text-white/85"
          style={{ left: `calc(50% - ${SPAN / 2}px)` }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={
            shared ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }
          }
          transition={
            shared
              ? { type: "spring", bounce: 0, duration: 0.5, delay: 0.85 }
              : { duration: 0.25, ease: EASE_OUT }
          }
        >
          Shared with the team
        </m.div>
      </div>

      <Reveal step={2} delay={1.1} className="mt-8 text-center">
        <p className="text-3xl text-white/85">
          Capacity is <Accent>pooled</Accent>, not bought twice.
        </p>
      </Reveal>

      <Footnote>
        Per-user provider accounts, 17 July 2026. Sharing an account with the
        team, 7 August 2026.
      </Footnote>
    </Shell>
  );
}
