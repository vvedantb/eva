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

/** Three colleagues, left to right. The first shares, the second draws on it. */
const PEOPLE = [0, 1, 2];

const COLUMN_WIDTH = 300;
const COLUMN_GAP = 90;
/** Centre to centre, first colleague to second. */
const SPAN = COLUMN_WIDTH + COLUMN_GAP;
const AVATAR = 132;
const BADGE_W = 200;
const BADGE_H = 56;
/** Avatar, then the `mt-6` gap, then half a badge: the badge row's centre line. */
const LINK_Y = AVATAR + 24 + BADGE_H / 2;
/** The link runs badge edge to badge edge, left of centre. */
const LINK_LEFT = -SPAN + BADGE_W / 2;
const LINK_W = SPAN - BADGE_W;

function Person({ index }: { index: number }) {
  const deckStep = useDeckStep();
  const attached = deckStep >= 1;
  /** The sharer lights first; the colleague lights as the link reaches them. */
  const linked = deckStep >= 2 && index < 2;
  const delay = attached ? index * 0.1 : 0;

  return (
    <div className="flex flex-col items-center" style={{ width: COLUMN_WIDTH }}>
      <div
        className="flex items-center justify-center rounded-full bg-white/[0.07]"
        style={{ width: AVATAR, height: AVATAR }}
      >
        <IconUser
          size={56}
          stroke={1.3}
          className="text-white/70"
          aria-hidden
        />
      </div>

      <m.div
        className="mt-6 flex items-center justify-center gap-3 rounded-[16px] bg-white/[0.07]"
        style={{ width: BADGE_W, height: BADGE_H }}
        initial={{ opacity: 0, y: -14, scale: 0.9 }}
        animate={
          attached
            ? {
                opacity: 1,
                y: 0,
                scale: 1,
                boxShadow: linked
                  ? `0 0 0 1.5px ${BRAND.blue}cc`
                  : "0 0 0 1.5px rgba(255,255,255,0)",
              }
            : { opacity: 0, y: -14, scale: 0.9 }
        }
        transition={
          attached
            ? {
                type: "spring",
                bounce: 0,
                duration: 0.55,
                delay: linked ? index * 0.8 : delay,
              }
            : { duration: 0.25, ease: EASE_OUT }
        }
      >
        <IconKey size={22} stroke={1.6} color={BRAND.blue} aria-hidden />
        <span className="text-lg text-white/85">Own account</span>
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

      <div className="flex flex-1 flex-col items-center justify-center pb-6">
        <div className="relative h-[290px] w-full">
          <div className="flex justify-center" style={{ gap: COLUMN_GAP }}>
            {PEOPLE.map((person) => (
              <Person key={person} index={person} />
            ))}
          </div>

          {/* One straight link, badge to badge, so it plainly joins these two. */}
          <m.div
            className="absolute h-[3px] origin-left rounded-full"
            style={{
              top: LINK_Y - 1.5,
              left: `calc(50% + ${LINK_LEFT}px)`,
              width: LINK_W,
              background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})`,
            }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={
              shared ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }
            }
            transition={{
              duration: shared ? 0.7 : 0.25,
              ease: EASE_OUT,
              delay: shared ? 0.15 : 0,
            }}
            aria-hidden
          />

          {/* Capacity flowing from the sharer to the colleague. */}
          <m.div
            className="absolute size-[14px] rounded-full bg-white shadow-[0_0_14px_rgba(59,125,216,0.9)]"
            style={{
              top: LINK_Y - 7,
              left: `calc(50% + ${LINK_LEFT - 7}px)`,
            }}
            initial={{ x: 0, opacity: 0 }}
            animate={
              shared
                ? { x: LINK_W, opacity: [0, 1, 1, 0] }
                : { x: 0, opacity: 0 }
            }
            transition={{
              duration: shared ? 1.1 : 0.2,
              ease: EASE_OUT,
              delay: shared ? 0.3 : 0,
              times: shared ? [0, 0.15, 0.8, 1] : undefined,
            }}
            aria-hidden
          />

          <m.div
            className="absolute -translate-x-1/2 rounded-full bg-white/[0.1] px-5 py-2 text-base whitespace-nowrap text-white/90"
            style={{
              top: LINK_Y + BADGE_H / 2 + 22,
              left: `calc(50% - ${SPAN / 2}px)`,
            }}
            initial={{ opacity: 0, y: -8 }}
            animate={shared ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
            transition={
              shared
                ? { type: "spring", bounce: 0, duration: 0.5, delay: 0.85 }
                : { duration: 0.25, ease: EASE_OUT }
            }
          >
            Shared with the team
          </m.div>
        </div>

        <Reveal step={2} delay={1.1} className="mt-10 text-center">
          <p className="text-4xl text-balance text-white/85">
            Capacity is <Accent>pooled</Accent>, not bought twice.
          </p>
        </Reveal>
      </div>

      <Footnote>
        Per-user provider accounts, 17 July 2026. Sharing an account with the
        team, 7 August 2026.
      </Footnote>
    </Shell>
  );
}
