import type { ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { BRAND, Card, EASE_OUT } from "../../_components/DeckPrimitives";

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
  /**
   * Soft repeating ring. Omit it entirely for nodes that never pulse; pass
   * false to fade a running pulse out.
   */
  pulse?: boolean;
}

export function PipelineNode({
  icon,
  label,
  sub,
  active,
  delay = 0,
  glow = false,
  flash = false,
  pulse,
}: PipelineNodeProps) {
  return (
    <div className="relative w-44 shrink-0">
      {/*
       * The ring pulses from the moment the slide appears, so the loop itself is
       * a CSS animation: a Motion keyframe loop started at mount does not run
       * under the app's lazy feature bundle. Motion still owns the fade-out,
       * which is driven by a prop change and so animates normally.
       */}
      {pulse !== undefined && (
        <m.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 1 }}
          animate={{ opacity: pulse ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <div
            className="absolute inset-0 animate-ping rounded-2xl opacity-50 ring-2 ring-[#8B3FB8]"
            style={{ animationDuration: "1.8s" }}
          />
        </m.div>
      )}

      {(glow || flash) && (
        <m.div
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-[20px] blur-lg"
          style={{
            background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
          initial={{ opacity: 0 }}
          animate={
            flash
              ? active
                ? { opacity: [0, 0.45, 0.15] }
                : { opacity: 0 }
              : { opacity: 0.35 }
          }
          transition={
            flash
              ? { duration: 1.2, delay: delay + 0.1, ease: "easeOut" }
              : { duration: 0.6, ease: EASE_OUT }
          }
        />
      )}

      <m.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
        transition={
          active
            ? { type: "spring", bounce: 0.2, duration: 0.5, delay }
            : { duration: 0.2 }
        }
        className="relative"
      >
        <Card
          className={cn(
            "flex h-[124px] flex-col items-center justify-center gap-2 px-4 py-4 text-center",
            glow && "bg-white/[0.09]",
          )}
        >
          <div className="text-white/80">{icon}</div>
          <div className="text-sm leading-tight font-medium text-white">
            {label}
          </div>
          <div className="text-xs leading-tight text-white/45">{sub}</div>
        </Card>
      </m.div>
    </div>
  );
}

interface PipelineConnectorProps {
  /** false leaves the connector unfilled. */
  active: boolean;
  delay?: number;
}

/** A 52 px rail that fills left to right, with a light packet running along it. */
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
        style={{
          background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
        }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: active ? 1 : 0 }}
        transition={{ duration: active ? 0.5 : 0.2, ease: "linear", delay }}
      />
      {/* Kept mounted: the travel has to be triggered by a prop change. */}
      <m.div
        aria-hidden
        className="absolute top-1/2 -mt-1 size-2 rounded-full bg-white shadow-[0_0_12px_#3B7DD8]"
        initial={{ x: 0, opacity: 0 }}
        animate={
          active
            ? { x: CONNECTOR_WIDTH - 8, opacity: [0, 1, 1, 0] }
            : { x: 0, opacity: 0 }
        }
        transition={{ duration: active ? 0.5 : 0.2, ease: "linear", delay }}
      />
    </div>
  );
}
