import { IconDeviceMobile } from "@tabler/icons-react";
import { m } from "motion/react";
import type { Transition } from "motion/react";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  Body,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

/** The whole slide reshapes on one spring, so every part uses the same one. */
const RESHAPE: Transition = { type: "spring", bounce: 0, duration: 0.85 };

/** What the audit actually delivered, three words at most each. */
const GAINS: readonly string[] = [
  "One pane",
  "Pinch to zoom",
  "Reachable controls",
];

function Lines({ rows, width }: { rows: readonly number[]; width: string }) {
  return (
    <div className="space-y-2.5" style={{ width }}>
      {rows.map((row, index) => (
        <span
          key={index}
          className="block h-2 rounded-full bg-white/12"
          style={{ width: `${row}%` }}
        />
      ))}
    </div>
  );
}

export function FridayMobile() {
  const phone = useDeckStep() >= 1;

  return (
    <Shell className="py-12">
      <Kicker>
        <span className="inline-flex items-center gap-2">
          <IconDeviceMobile size={15} aria-hidden />
          Small screens
        </span>
      </Kicker>
      <Title size="md">
        Raise work from <Accent>your phone</Accent>.
      </Title>
      <Body className="mt-4 max-w-3xl">
        The same web app, reshaped for a small screen.
      </Body>

      {/* Fixed height so the frame changes shape without shifting the row. */}
      <div className="mt-6 flex h-[380px] items-center gap-24">
        <div className="flex w-[660px] justify-center">
          <m.div
            className="bg-white/[0.06] ring-1 ring-white/10"
            animate={{
              width: phone ? 248 : 620,
              height: phone ? 372 : 318,
              borderRadius: phone ? 34 : 22,
              padding: phone ? 10 : 8,
            }}
            transition={RESHAPE}
          >
            <m.div
              className="flex h-full gap-3 bg-[#0b0c11] p-3 ring-1 ring-white/[0.06]"
              animate={{ borderRadius: phone ? 24 : 14 }}
              transition={RESHAPE}
            >
              <m.div
                className="overflow-hidden rounded-[10px] bg-white/[0.05] p-3"
                animate={{ width: phone ? 0 : 130, opacity: phone ? 0 : 1 }}
                transition={RESHAPE}
              >
                <Lines rows={[90, 70, 80, 55]} width="106px" />
              </m.div>

              <div className="flex-1 overflow-hidden rounded-[10px] bg-white/[0.05] p-3">
                <span className="block h-2.5 w-[60%] rounded-full bg-white/25" />
                <div className="mt-4">
                  <Lines rows={[100, 92, 78, 96, 64]} width="100%" />
                </div>
              </div>

              <m.div
                className="overflow-hidden rounded-[10px] bg-white/[0.05] p-3"
                animate={{ width: phone ? 0 : 150, opacity: phone ? 0 : 1 }}
                transition={RESHAPE}
              >
                <Lines rows={[80, 100, 60]} width="126px" />
              </m.div>
            </m.div>
          </m.div>
        </div>

        <div>
          <div className="flex items-baseline gap-4">
            <CountUp
              value={640}
              step={1}
              duration={1.2}
              suffix=" px"
              className="text-6xl leading-none font-semibold tabular-nums text-white"
            />
          </div>
          <m.div
            className="mt-4 text-lg text-white/55"
            animate={{ opacity: phone ? 1 : 0 }}
            transition={{ duration: 0.4, delay: phone ? 0.3 : 0 }}
          >
            and below
          </m.div>

          <div className="mt-10 flex flex-col items-start gap-2.5">
            {GAINS.map((gain, index) => (
              <m.span
                key={gain}
                className="rounded-full bg-white/[0.07] px-4 py-2 text-sm text-white/85"
                initial={{ opacity: 0, y: 14 }}
                animate={phone ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
                transition={{
                  type: "spring",
                  bounce: 0,
                  duration: 0.55,
                  delay: phone ? 0.45 + index * 0.09 : 0,
                }}
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
