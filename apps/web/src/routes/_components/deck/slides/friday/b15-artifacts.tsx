import { IconArrowUp, IconFileText, IconLink } from "@tabler/icons-react";
import { m } from "motion/react";
import type { Transition } from "motion/react";
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
  Connector,
  DUR,
  EASE,
  LEAVE,
  SETTLE,
  Sheen,
  cueTransition,
} from "../../_components/motion";
import { MoF3ArtifactPage, PAGE_WIDTH } from "../_parts/MoF3ArtifactPage";

const GROW: Transition = { type: "spring", bounce: 0, duration: 0.9 };

const CHAT_WIDTH = 420;
const GAP = 48;
/** Until the chat arrives, the page holds the middle of the row. */
const CENTRE_OFFSET = (GAP + CHAT_WIDTH) / 2;

/** The chat's tab row. The first is original; the other two arrived later. */
const TABS: readonly string[] = ["Chat", "Artifacts", "Documents"];
const TAB_WIDTH = 96;
const SAVED: readonly string[] = ["Referral report", "Provider comparison"];

/** Where the first saved row sits in the row's box, so the link can reach it. */
const ROW_Y = 150;

const enter = (on: boolean, delay: number) =>
  cueTransition(on, delay, { duration: DUR.slow, ease: EASE.expo });

/** The chat panel: Artifacts tab selected, saved pages listed, composer below. */
function ChatTabs({ tabbed }: { tabbed: boolean }) {
  return (
    <m.div
      className="rounded-[20px] bg-white/[0.05] p-1 ring-1 ring-white/10"
      style={{ width: CHAT_WIDTH }}
      initial={{ opacity: 0, x: 64 }}
      animate={tabbed ? { opacity: 1, x: 0 } : { opacity: 0, x: 64 }}
      transition={cueTransition(tabbed, 0.05, {
        duration: DUR.hero,
        ease: EASE.expo,
        opacity: { duration: DUR.base },
      })}
    >
      <div className="relative flex px-2 py-2">
        {/* The hero: the selection glides from Chat onto the new tab. */}
        <m.span
          aria-hidden
          className="absolute top-2 bottom-2 left-2 rounded-full bg-white/[0.12]"
          style={{ width: TAB_WIDTH }}
          initial={{ x: 0 }}
          animate={{ x: tabbed ? TAB_WIDTH : 0 }}
          transition={tabbed ? { ...SETTLE, delay: 0.55 } : LEAVE}
        />
        {TABS.map((tab, index) => (
          <m.span
            key={tab}
            className="relative py-1.5 text-center text-sm whitespace-nowrap"
            style={{ width: TAB_WIDTH }}
            initial={{ opacity: 0, y: 6 }}
            animate={tabbed ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
            transition={enter(tabbed, 0.2 + index * 0.08)}
          >
            <m.span
              initial={{ opacity: 0.55 }}
              animate={{ opacity: tabbed && index === 1 ? 1 : 0.55 }}
              transition={{ duration: DUR.base, delay: tabbed ? 0.7 : 0 }}
              className="text-white"
            >
              {tab}
            </m.span>
          </m.span>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-[16px] bg-[#0b0c11] p-3 ring-1 ring-white/[0.06]">
        {SAVED.map((name, index) => (
          <m.div
            key={name}
            initial={{ opacity: 0, y: 12 }}
            animate={tabbed ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={enter(tabbed, 0.85 + index * 0.1)}
          >
            <Sheen
              step={2}
              delay={1.35 + index * 0.1}
              className={
                index === 0
                  ? "rounded-[12px] bg-white/[0.08] ring-1 ring-[#3B7DD8]/40"
                  : "rounded-[12px] bg-white/[0.05]"
              }
            >
              <div className="flex h-14 items-center gap-3 px-4">
                <IconFileText size={18} aria-hidden className="text-white/55" />
                <span className="flex-1 text-base text-white/85">{name}</span>
                <IconLink size={16} aria-hidden className="text-[#3B7DD8]" />
              </div>
            </Sheen>
          </m.div>
        ))}
      </div>
      <m.div
        className="m-2 flex h-11 items-center rounded-full bg-white/[0.06] pr-1 pl-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: tabbed ? 1 : 0 }}
        transition={enter(tabbed, 1.05)}
      >
        <span className="flex-1 text-sm text-white/35">Ask Eva</span>
        <span className="flex size-9 items-center justify-center rounded-full bg-white/[0.12] text-white/70">
          <IconArrowUp size={15} aria-hidden />
        </span>
      </m.div>
    </m.div>
  );
}

export function FridayArtifacts() {
  const step = useDeckStep();
  const hosted = step >= 1;
  const tabbed = step >= 2;

  return (
    <Shell className="py-12">
      <Kicker>Trust and reach · Artifacts</Kicker>
      <Title size="md">
        Pages you can <Accent>just open</Accent>.
      </Title>
      <Body className="mt-4 max-w-3xl">
        The agent saves a page. You get a link.
      </Body>

      <div className="flex flex-1 items-center justify-center pb-10">
        <m.div
          className="relative flex items-center"
          style={{ gap: GAP }}
          initial={false}
          animate={{ x: tabbed ? 0 : CENTRE_OFFSET }}
          transition={GROW}
        >
          <MoF3ArtifactPage hosted={hosted} />
          <ChatTabs tabbed={tabbed} />
          {/* The saved row and the open page are the same thing. */}
          <m.div
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: tabbed ? 1 : 0 }}
            transition={{ duration: 0.01, delay: tabbed ? 1.4 : 0 }}
          >
            <Connector
              from={{ x: PAGE_WIDTH + GAP + 14, y: ROW_Y }}
              to={{ x: PAGE_WIDTH + 6, y: ROW_Y - 44 }}
              bend={-14}
              step={2}
              delay={1.4}
              flowPeriod={1.2}
            />
          </m.div>
        </m.div>
      </div>

      <Footnote>
        Hosted artifacts landed 17 June 2026. Every chat gained its own
        Artifacts and Documents tabs on 12 September 2026.
      </Footnote>
    </Shell>
  );
}
