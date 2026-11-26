import type { ReactNode } from "react";
import { m } from "motion/react";
import { EvaDiscMark } from "../../_components/EvaDiscMark";
import { Shell } from "../../_components/DeckPrimitives";
import { ACCENT, EASE, MaskedText, accentMix } from "../../_components/motion";
import { BeeLogo } from "../bee/_parts/BeeLogo";
import {
  CarePulseMark,
  FlowtapeMark,
  RedlineMark,
  VmemMark,
} from "./_parts/ProjectMarks";

/**
 * A section opener: the project's mark lands with a soft halo in the
 * section's own colours (`DeckSlide.section`), then its name rises.
 */
function SectionOpener({
  mark,
  name,
  caption,
}: {
  mark: ReactNode;
  name: string;
  caption?: string;
}) {
  return (
    <Shell center>
      <div className="relative isolate flex flex-col items-center">
        <div className="relative mb-10 grid size-[112px] place-items-center">
          <m.span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: `radial-gradient(circle, ${accentMix(ACCENT.a, 22)}, ${accentMix(ACCENT.b, 8)} 40%, transparent 66%)`,
            }}
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.4, ease: EASE.expo, delay: 0.1 }}
          />
          <m.div
            initial={{ scale: 0.6, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 1.1, ease: EASE.expo, delay: 0.15 }}
          >
            {mark}
          </m.div>
        </div>

        <h1 className="text-8xl leading-[1.02] font-semibold tracking-[-0.025em] text-white">
          <MaskedText delay={0.5} duration={1}>
            {name}
          </MaskedText>
        </h1>

        {caption ? (
          <m.p
            className="mt-8 text-2xl text-white/55"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE.out, delay: 1.1 }}
          >
            {caption}
          </m.p>
        ) : null}
      </div>
    </Shell>
  );
}

export function SectionEva() {
  return <SectionOpener mark={<EvaDiscMark size={104} />} name="Eva" />;
}

export function SectionCarePulse() {
  return <SectionOpener mark={<CarePulseMark size={168} />} name="CarePulse" />;
}

export function SectionVmem() {
  return (
    <SectionOpener
      mark={<VmemMark size={104} />}
      name="vmem"
      caption="Built in my own time, alongside Eva"
    />
  );
}

export function SectionFlowtape() {
  return <SectionOpener mark={<FlowtapeMark size={84} />} name="flowtape" />;
}

export function SectionRedline() {
  return <SectionOpener mark={<RedlineMark size={96} />} name="Redline" />;
}

export function SectionBee() {
  return (
    <SectionOpener
      mark={<BeeLogo size={112} tone="dark" glow={false} />}
      name="Bee"
    />
  );
}
