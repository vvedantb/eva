import type { ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { cn } from "@eva/ui";
import { BRAND, Card } from "../../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  DUR,
  EASE,
  Sheen,
  cueTransition,
} from "../../_components/motion";

const CONNECTOR_WIDTH = 52;

interface PipelineNodeProps {
  icon: ReactNode;
  label: string;
  sub: string;
  /** false keeps the node in its resting, hidden state. */
  active: boolean;
  /** Seconds to wait after `active` turns true. */
  delay?: number;
  /** Steady brand glow — used for the one human step. */
  glow?: boolean;
  /** A single brand glow that fades out — used when the change goes live. */
  flash?: boolean;
  /** Soft repeating ring. Omit it for nodes that never pulse; pass false to stop it. */
  pulse?: boolean;
  /** Plays a press: the node dips as the cursor clicks it. */
  pressed?: boolean;
  /** Seconds after `pressed` turns true that the click lands. */
  pressAt?: number;
  /** The build step the node lights on, which cues its sheen. */
  step?: number;
}

/**
 * One stage of the pipeline. Before it arrives, a dashed slot holds its place so
 * the whole route is visible from the first frame; on arrival the card rises,
 * and a band of light passes over it as it lights.
 */
export function PipelineNode({
  icon,
  label,
  sub,
  active,
  delay = 0,
  glow = false,
  flash = false,
  pulse,
  pressed = false,
  pressAt = 0,
  step = 0,
}: PipelineNodeProps) {
  return (
    <div className="relative w-44 shrink-0">
      <m.div
        aria-hidden
        className="absolute inset-0 rounded-2xl border border-dashed border-white/10"
        initial={false}
        animate={{ opacity: active ? 0 : 1 }}
        transition={cueTransition(active, delay, { duration: DUR.base })}
      />

      <AnimatePresence>
        {pulse ? (
          <m.div
            key="pulse"
            aria-hidden
            className="pointer-events-none absolute inset-0"
            exit={{ opacity: 0, transition: { duration: DUR.fast } }}
          >
            <m.div
              className="absolute inset-0 rounded-2xl ring-2 ring-[#8B3FB8]"
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: [0.7, 0], scale: [1, 1.14] }}
              transition={{
                duration: 1.8,
                ease: "easeOut",
                repeat: Infinity,
                delay: 1,
              }}
            />
          </m.div>
        ) : null}
      </AnimatePresence>

      {(glow || flash) && (
        <m.div
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-[20px] blur-lg"
          style={{ background: BRAND_GRADIENT }}
          initial={{ opacity: 0 }}
          animate={
            flash
              ? active
                ? { opacity: [0, 0.5, 0.18] }
                : { opacity: 0 }
              : { opacity: 0.35 }
          }
          transition={
            flash
              ? active
                ? { duration: 1.4, delay: delay + 0.15, ease: EASE.out }
                : { duration: DUR.fast }
              : { duration: DUR.slow, ease: EASE.out, delay: 0.9 }
          }
        />
      )}

      <m.div
        initial={{ opacity: 0, y: 14, scale: 0.94 }}
        animate={
          active
            ? { opacity: 1, y: 0, scale: pressed ? [1, 0.95, 1] : 1 }
            : { opacity: 0, y: 14, scale: 0.94 }
        }
        transition={
          active
            ? {
                duration: DUR.slow,
                ease: EASE.expo,
                delay,
                scale: pressed
                  ? {
                      duration: 0.4,
                      times: [0, 0.35, 1],
                      ease: EASE.out,
                      delay: pressAt,
                    }
                  : { duration: DUR.slow, ease: EASE.expo, delay },
              }
            : { duration: DUR.fast }
        }
        className="relative"
      >
        <Sheen
          step={step}
          delay={delay + 0.25}
          duration={0.9}
          className="rounded-2xl"
        >
          <Card
            className={cn(
              "flex h-[132px] flex-col items-center justify-center gap-2 px-4 py-4 text-center",
              glow && "bg-white/[0.09]",
            )}
          >
            <div className="text-white/80">{icon}</div>
            <div className="text-sm leading-tight font-medium text-white">
              {label}
            </div>
            <div className="text-xs leading-tight text-white/45">{sub}</div>
          </Card>
        </Sheen>
      </m.div>
    </div>
  );
}

interface PipelineConnectorProps {
  /** false leaves the connector unfilled. */
  active: boolean;
  delay?: number;
}

const RUN = 0.38;

/** A 52 px rail that fills left to right, with a light packet running its tip. */
export function PipelineConnector({
  active,
  delay = 0,
}: PipelineConnectorProps) {
  return (
    <div
      className="relative h-px shrink-0 self-center bg-white/15"
      style={{ width: CONNECTOR_WIDTH }}
    >
      <m.div
        aria-hidden
        className="absolute inset-0 origin-left"
        style={{ background: BRAND_GRADIENT }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: active ? 1 : 0 }}
        transition={cueTransition(active, delay, {
          duration: RUN,
          ease: EASE.inOut,
        })}
      />
      {/* Kept mounted: the travel has to be triggered by a prop change. */}
      <m.div
        aria-hidden
        className="absolute top-1/2 -mt-1 size-2 rounded-full bg-white"
        style={{ boxShadow: `0 0 12px ${BRAND.blue}` }}
        initial={{ x: 0, opacity: 0 }}
        animate={
          active
            ? { x: CONNECTOR_WIDTH - 8, opacity: [0, 1, 1, 0] }
            : { x: 0, opacity: 0 }
        }
        transition={
          active
            ? { duration: RUN, ease: EASE.inOut, delay }
            : { duration: DUR.fast }
        }
      />
    </div>
  );
}
