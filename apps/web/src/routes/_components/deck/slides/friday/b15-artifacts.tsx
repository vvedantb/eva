import { IconFileText, IconLink, IconWorld } from "@tabler/icons-react";
import { m } from "motion/react";
import type { Transition } from "motion/react";
import {
  Accent,
  BRAND,
  Body,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

const GROW: Transition = { type: "spring", bounce: 0, duration: 0.75 };

/** The chat's tab row. The first is original; the other two arrived later. */
const TABS: readonly string[] = ["Chat", "Artifacts", "Documents"];

function Bars({ rows }: { rows: readonly number[] }) {
  return (
    <div className="space-y-2.5">
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

export function FridayArtifacts() {
  const step = useDeckStep();
  const hosted = step >= 1;
  const tabbed = step >= 2;

  return (
    <Shell className="py-12">
      <Kicker>Artifacts</Kicker>
      <Title size="md">
        Pages you can <Accent>just open</Accent>.
      </Title>
      <Body className="mt-4 max-w-3xl">
        The agent saves a page. You get a link.
      </Body>

      <div className="mt-8 flex h-[300px] items-center gap-16">
        <div className="flex w-[560px] justify-center">
          <m.div
            className="bg-white/[0.06] p-2 ring-1 ring-white/10"
            animate={{
              width: hosted ? 500 : 280,
              height: hosted ? 276 : 180,
              borderRadius: hosted ? 22 : 18,
            }}
            transition={GROW}
          >
            <m.div
              className="flex h-full flex-col bg-[#0b0c11] ring-1 ring-white/[0.06]"
              animate={{ borderRadius: hosted ? 14 : 10 }}
              transition={GROW}
            >
              <m.div
                className="flex items-center gap-2 overflow-hidden px-4"
                animate={{ height: hosted ? 40 : 0, opacity: hosted ? 1 : 0 }}
                transition={GROW}
              >
                <IconWorld size={14} aria-hidden className="text-white/35" />
                <span className="h-4 flex-1 rounded-full bg-white/[0.07]" />
              </m.div>

              <div className="flex-1 p-5">
                <m.div
                  className="flex items-center gap-2 text-white/45"
                  animate={{ opacity: hosted ? 0 : 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <IconFileText size={16} aria-hidden />
                  <span className="text-xs">Saved page</span>
                </m.div>
                <div className="mt-4">
                  <Bars rows={hosted ? [100, 88, 72, 94, 60] : [90, 70, 50]} />
                </div>
              </div>
            </m.div>
          </m.div>

          <m.span
            className="relative -mb-4 -ml-6 self-end rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap text-white"
            style={{
              background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
            }}
            initial={{ opacity: 0, scale: 0.8, y: 12 }}
            animate={
              hosted
                ? { opacity: 1, scale: 1, y: 0 }
                : { opacity: 0, scale: 0.8, y: 12 }
            }
            transition={{
              type: "spring",
              bounce: 0.35,
              duration: 0.6,
              delay: hosted ? 0.45 : 0,
            }}
          >
            <span className="inline-flex items-center gap-2">
              <IconLink size={15} aria-hidden />
              Open the link
            </span>
          </m.span>
        </div>

        <m.div
          className="w-[360px] rounded-[20px] bg-white/[0.05] p-1 ring-1 ring-white/10"
          initial={{ opacity: 0, y: 24 }}
          animate={tabbed ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ type: "spring", bounce: 0, duration: 0.6 }}
        >
          <div className="flex gap-1 px-2 py-2">
            {TABS.map((tab, index) => (
              <m.span
                key={tab}
                className="rounded-full px-3.5 py-1.5 text-xs whitespace-nowrap"
                initial={{ opacity: 0, x: -10 }}
                animate={tabbed ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
                transition={{
                  type: "spring",
                  bounce: 0,
                  duration: 0.5,
                  delay: tabbed ? 0.25 + index * 0.12 : 0,
                }}
                style={{
                  backgroundColor:
                    index === 0 ? "rgba(255,255,255,0.10)" : undefined,
                  color:
                    index === 0
                      ? "rgba(255,255,255,0.9)"
                      : "rgba(255,255,255,0.5)",
                }}
              >
                {tab}
              </m.span>
            ))}
          </div>
          <div className="rounded-[16px] bg-[#0b0c11] p-5 ring-1 ring-white/[0.06]">
            <Bars rows={[100, 80, 92, 64]} />
          </div>
        </m.div>
      </div>

      <Footnote>
        Hosted artifacts landed 17 June 2026. Every chat gained its own
        Artifacts and Documents tabs on 12 September 2026.
      </Footnote>
    </Shell>
  );
}
