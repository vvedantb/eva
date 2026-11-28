import { IconKey, IconUser } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  Connector,
  DUR,
  EASE,
  MaskedText,
  cueTransition,
} from "../../_components/motion";
import { MoA2AvatarRing } from "../_parts/MoA2AvatarRing";

const PEOPLE = [0, 1, 2];

const STAGE_W = 1088;
const COLUMN_WIDTH = 300;
const COLUMN_GAP = 90;
const SPAN = COLUMN_WIDTH + COLUMN_GAP;
const AVATAR = 132;
const BADGE_W = 200;
const BADGE_H = 56;
const LINK_Y = AVATAR + 24 + BADGE_H / 2;
const SHARER_X = STAGE_W / 2 - SPAN;
const TAKER_X = STAGE_W / 2;
const LINK_FROM = { x: SHARER_X + BADGE_W / 2 + 6, y: LINK_Y };
const LINK_TO = { x: TAKER_X - BADGE_W / 2 - 6, y: LINK_Y };

const PACKET =
  "radial-gradient(circle, #fff 0 24%, rgba(59,125,216,0.6) 40%, transparent 70%)";

function Person({ index }: { index: number }) {
  const deckStep = useDeckStep();
  const attached = deckStep >= 1;
  const linked = deckStep >= 2 && index < 2;
  const at = index * 0.12;

  return (
    <div className="flex flex-col items-center" style={{ width: COLUMN_WIDTH }}>
      <div
        className="relative flex items-center justify-center rounded-full bg-white/[0.07]"
        style={{ width: AVATAR, height: AVATAR }}
      >
        <MoA2AvatarRing size={AVATAR} on={attached} delay={at} />
        <IconUser
          size={56}
          stroke={1.3}
          className="text-white/70"
          aria-hidden
        />
      </div>

      <m.div
        className="relative mt-6 flex items-center justify-center gap-3 rounded-[16px] bg-white/[0.07]"
        style={{ width: BADGE_W, height: BADGE_H }}
        initial={{ opacity: 0, y: -18, scale: 0.9 }}
        animate={
          attached
            ? { opacity: 1, y: 0, scale: 1 }
            : { opacity: 0, y: -18, scale: 0.9 }
        }
        transition={cueTransition(attached, 0.15 + at, {
          duration: DUR.slow,
          ease: EASE.expo,
        })}
      >
        <m.span
          aria-hidden
          className="absolute inset-0 rounded-[inherit] ring-[1.5px] ring-[#3B7DD8]/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: linked ? 1 : 0 }}
          transition={cueTransition(linked, index === 0 ? 0.1 : 1.05, {
            duration: DUR.base,
            ease: EASE.out,
          })}
        />
        <m.span
          className="flex"
          initial={{ rotate: -40 }}
          animate={{ rotate: attached ? 0 : -40 }}
          transition={cueTransition(attached, 0.3 + at, {
            duration: DUR.slow,
            ease: EASE.expo,
          })}
        >
          <IconKey size={22} stroke={1.6} color={BRAND.blue} aria-hidden />
        </m.span>
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
        <Title size="md">Bring your own account</Title>
      </Reveal>

      <div className="flex flex-1 flex-col items-center justify-center pb-6">
        <div className="relative h-[290px]" style={{ width: STAGE_W }}>
          <Stagger
            delayChildren={0.3}
            staggerChildren={0.1}
            className="flex justify-center gap-[90px]"
          >
            {PEOPLE.map((person) => (
              <StaggerItem key={person}>
                <Person index={person} />
              </StaggerItem>
            ))}
          </Stagger>

          <Connector
            from={LINK_FROM}
            to={LINK_TO}
            step={2}
            delay={0.15}
            strokeWidth={3}
          />

          <m.span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 size-5 rounded-full"
            style={{ background: PACKET }}
            initial={{ x: LINK_FROM.x - 10, y: LINK_Y - 10, opacity: 0 }}
            animate={
              shared
                ? { x: LINK_TO.x - 10, opacity: [0, 1, 1, 0] }
                : { x: LINK_FROM.x - 10, opacity: 0 }
            }
            transition={
              shared
                ? {
                    x: { duration: 0.9, ease: EASE.inOut, delay: 0.2 },
                    opacity: {
                      duration: 1,
                      times: [0, 0.1, 0.85, 1],
                      delay: 0.2,
                    },
                  }
                : { duration: 0 }
            }
          />

          <m.div
            className="absolute -translate-x-1/2 rounded-full bg-white/[0.1] px-5 py-2 text-base whitespace-nowrap text-white/90"
            style={{
              top: LINK_Y + BADGE_H / 2 + 22,
              left: (SHARER_X + TAKER_X) / 2,
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={shared ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
            transition={cueTransition(shared, 0.85, {
              duration: DUR.slow,
              ease: EASE.expo,
            })}
          >
            Shared with the team
          </m.div>
        </div>

        <p className="mt-10 text-center text-4xl text-balance text-white/85">
          <MaskedText step={2} delay={1.15}>
            Capacity is <Accent>pooled</Accent>, not bought twice
          </MaskedText>
        </p>
      </div>
    </Shell>
  );
}
