import { IconDeviceMobile } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Body,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  CountRoll,
  DUR,
  EASE,
  MaskedText,
  cueTransition,
} from "../../_components/motion";
import { MoF2Device } from "../_parts/MoF2Device";

/** What the audit actually delivered, three words at most each. */
const GAINS: readonly string[] = [
  "One pane",
  "Pinch to zoom",
  "Reachable controls",
];

/** Step 0 centres the desktop on the stage; step 1 slides the phone aside for the numbers. */
const CENTRE_OFFSET = 214;

export function FridayMobile() {
  const phone = useDeckStep() >= 1;

  return (
    <Shell className="py-12">
      <Kicker>
        <span className="inline-flex items-center gap-2">
          <IconDeviceMobile size={15} aria-hidden />
          Trust and reach · Your phone
        </span>
      </Kicker>
      <Title size="md">
        Raise work from <Accent>your phone</Accent>.
      </Title>
      <Body className="mt-4 max-w-3xl">
        <MaskedText delay={0.4} duration={0.8}>
          The same web app, reshaped for a small screen.
        </MaskedText>
      </Body>

      {/* Fixed height so the frame changes shape without shifting the row. */}
      <div className="mt-6 flex h-[400px] items-center gap-24">
        <m.div
          className="flex w-[660px] justify-center"
          initial={{ opacity: 0, x: CENTRE_OFFSET, y: 24 }}
          animate={{ opacity: 1, x: phone ? 0 : CENTRE_OFFSET, y: 0 }}
          transition={{
            x: { duration: 1, ease: EASE.expo },
            y: { duration: DUR.hero, ease: EASE.expo, delay: 0.45 },
            opacity: { duration: DUR.slow, delay: 0.45 },
          }}
        >
          <MoF2Device phone={phone} />
        </m.div>

        <div>
          <div className="text-6xl leading-none font-semibold text-white">
            <CountRoll
              value={640}
              step={1}
              delay={0.35}
              duration={1.2}
              suffix=" px"
            />
          </div>
          <div className="mt-4 text-lg text-white/55">
            <MaskedText step={1} delay={0.65} duration={0.7}>
              and below
            </MaskedText>
          </div>

          <div className="mt-10 flex flex-col items-start gap-2.5">
            {GAINS.map((gain, index) => (
              <m.span
                key={gain}
                className="rounded-full bg-white/[0.07] px-4 py-2 text-sm text-white/85 ring-1 ring-white/[0.06]"
                initial={{ opacity: 0, x: -12 }}
                animate={phone ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
                transition={cueTransition(phone, 0.8 + index * 0.09, {
                  duration: DUR.slow,
                  ease: EASE.expo,
                })}
              >
                {gain}
              </m.span>
            ))}
          </div>
        </div>
      </div>

      <Footnote>
        The web app, made usable on a phone. 17 August and 4 September 2026.
      </Footnote>
    </Shell>
  );
}
