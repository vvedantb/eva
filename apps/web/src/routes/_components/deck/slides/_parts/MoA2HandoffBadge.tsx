import { m } from "motion/react";
import { BRAND } from "../../_components/DeckPrimitives";
import { DUR, EASE, Pulse } from "../../_components/motion";

const BADGE_W = 240;
const BADGE_H = 64;

/** The provider's name, with a painted ring (not a box-shadow) when it holds the job. */
function BadgeFace({ name, lit }: { name: string; lit: boolean }) {
  return (
    <m.div
      className="relative flex size-full items-center justify-center rounded-[20px] text-xl font-medium"
      initial={false}
      animate={{
        backgroundColor: lit
          ? "rgba(255,255,255,0.10)"
          : "rgba(255,255,255,0.04)",
        color: lit ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)",
      }}
      transition={{ duration: DUR.slow, ease: EASE.out, delay: lit ? 0.55 : 0 }}
    >
      <m.span
        aria-hidden
        className="absolute inset-0 rounded-[inherit] ring-1 ring-[#3B7DD8]/55"
        initial={false}
        animate={{ opacity: lit ? 1 : 0 }}
        transition={{ duration: DUR.slow, delay: lit ? 0.55 : 0 }}
      />
      {name}
    </m.div>
  );
}

/**
 * `receives` marks the provider the job lands on: once it has, one slow ring
 * breathes out from it, so the room can see where the work now lives.
 */
export function MoA2HandoffBadge({
  name,
  lit,
  x,
  receives = false,
  landAt,
}: {
  name: string;
  lit: boolean;
  /** Centre of the badge in the handoff stage, in pixels. */
  x: number;
  receives?: boolean;
  /** Seconds after step 1 when the conversation lands, for the ring to start. */
  landAt: number;
}) {
  return (
    <div
      className="absolute top-0"
      style={{ left: x - BADGE_W / 2, width: BADGE_W, height: BADGE_H }}
    >
      {receives ? (
        <Pulse
          step={1}
          rings={1}
          reach={1.12}
          period={2.6}
          color={`${BRAND.blue}aa`}
          delay={landAt}
          className="size-full rounded-[20px]"
        >
          <BadgeFace name={name} lit={lit} />
        </Pulse>
      ) : (
        <BadgeFace name={name} lit={lit} />
      )}
    </div>
  );
}
