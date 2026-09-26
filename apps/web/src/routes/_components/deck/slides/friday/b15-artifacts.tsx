import {
  IconArrowUp,
  IconFileText,
  IconLink,
  IconWorld,
} from "@tabler/icons-react";
import { m } from "motion/react";
import type { Transition } from "motion/react";
import {
  Accent,
  Body,
  EASE_OUT,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { FriLines } from "../_parts/FriMock";

const GROW: Transition = { type: "spring", bounce: 0, duration: 0.75 };
const SETTLE: Transition = { type: "spring", bounce: 0, duration: 0.55 };
const LEAVE: Transition = { duration: 0.2, ease: EASE_OUT };

/** Lands on the settle spring after `delay`; leaves on the shorter fade. */
const land = (on: boolean, delay = 0): Transition =>
  on ? { ...SETTLE, delay } : LEAVE;

const PAGE_WIDTH = 560;
const CHAT_WIDTH = 420;
const GAP = 48;
/** Until the chat arrives, the page holds the middle of the row. */
const CENTRE_OFFSET = (GAP + CHAT_WIDTH) / 2;

/** The chat's tab row. The first is original; the other two arrived later. */
const TABS: readonly string[] = ["Chat", "Artifacts", "Documents"];
const TAB_WIDTH = 96;
/** Relative bar heights for the page's chart. Shape only, no figures. */
const CHART: readonly number[] = [42, 58, 50, 72, 64, 86, 78, 96];
const SAVED: readonly string[] = ["Referral report", "Provider comparison"];

/** What the hosted page shows: a heading, a chart and a short table. */
function HostedPage({ hosted }: { hosted: boolean }) {
  return (
    <m.div
      className="absolute inset-0 flex flex-col gap-4 p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: hosted ? 1 : 0 }}
      transition={hosted ? { duration: 0.4, delay: 0.25 } : LEAVE}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold text-white">
          Referral report
        </span>
        <span className="text-[11px] text-white/40">Last 12 weeks</span>
      </div>
      <div className="flex h-[112px] items-end gap-2.5 rounded-[12px] bg-white/[0.04] px-4 pt-4">
        {CHART.map((height, index) => (
          <m.span
            key={index}
            className="flex-1 origin-bottom rounded-t-[6px] bg-gradient-to-t from-[#8B3FB8] to-[#3B7DD8]"
            style={{ height: `${height}%` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: hosted ? 1 : 0 }}
            transition={land(hosted, 0.4 + index * 0.06)}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="flex h-8 items-center gap-3 rounded-[10px] bg-white/[0.04] px-3"
          >
            <span className="size-3 rounded-full bg-white/15" />
            <span className="h-2 w-[140px] rounded-full bg-white/12" />
            <span className="ml-auto h-2 w-[52px] rounded-full bg-white/12" />
          </div>
        ))}
      </div>
    </m.div>
  );
}

function PageFrame({ hosted }: { hosted: boolean }) {
  return (
    <div className="relative">
      <m.div
        className="bg-white/[0.06] p-2 ring-1 ring-white/10"
        initial={false}
        animate={{
          width: hosted ? PAGE_WIDTH : 300,
          height: hosted ? 372 : 200,
          borderRadius: hosted ? 22 : 18,
        }}
        transition={GROW}
      >
        <m.div
          className="flex h-full flex-col overflow-hidden bg-[#0b0c11] ring-1 ring-white/[0.06]"
          animate={{ borderRadius: hosted ? 14 : 10 }}
          transition={GROW}
        >
          <m.div
            className="flex shrink-0 items-center gap-2 overflow-hidden px-4"
            animate={{ height: hosted ? 40 : 0, opacity: hosted ? 1 : 0 }}
            transition={GROW}
          >
            <IconWorld size={14} aria-hidden className="text-white/35" />
            <span className="flex h-5 flex-1 items-center rounded-full bg-white/[0.07] px-3 text-[11px] text-white/45">
              eva / artifacts / referral-report
            </span>
          </m.div>

          <div className="relative flex-1">
            <m.div
              className="absolute inset-0 p-5"
              animate={{ opacity: hosted ? 0 : 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-2 text-white/55">
                <IconFileText size={16} aria-hidden />
                <span className="text-sm">Saved page</span>
              </div>
              <FriLines widths={[220, 170, 120]} className="mt-5" />
            </m.div>
            <HostedPage hosted={hosted} />
          </div>
        </m.div>
      </m.div>

      <m.span
        className="absolute -right-8 -bottom-5 rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] px-4 py-2 text-sm font-medium whitespace-nowrap text-white"
        initial={{ opacity: 0, scale: 0.8, y: 12 }}
        animate={
          hosted
            ? { opacity: 1, scale: 1, y: 0 }
            : { opacity: 0, scale: 0.8, y: 12 }
        }
        transition={land(hosted, 0.7)}
      >
        <span className="inline-flex items-center gap-2">
          <IconLink size={15} aria-hidden />
          Open the link
        </span>
      </m.span>
    </div>
  );
}

/** The chat panel: Artifacts tab selected, saved pages listed, composer below. */
function ChatTabs({ tabbed }: { tabbed: boolean }) {
  return (
    <m.div
      className="rounded-[20px] bg-white/[0.05] p-1 ring-1 ring-white/10"
      style={{ width: CHAT_WIDTH }}
      initial={{ opacity: 0, x: 32 }}
      animate={tabbed ? { opacity: 1, x: 0 } : { opacity: 0, x: 32 }}
      transition={land(tabbed, 0.1)}
    >
      <div className="relative flex px-2 py-2">
        <m.span
          aria-hidden
          className="absolute top-2 bottom-2 left-2 rounded-full bg-white/[0.1]"
          style={{ width: TAB_WIDTH }}
          animate={{ x: tabbed ? TAB_WIDTH : 0 }}
          transition={land(tabbed, 0.75)}
        />
        {TABS.map((tab, index) => (
          <m.span
            key={tab}
            className="relative py-1.5 text-center text-sm whitespace-nowrap"
            style={{ width: TAB_WIDTH }}
            initial={{ opacity: 0, x: -10 }}
            animate={tabbed ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
            transition={land(tabbed, 0.25 + index * 0.1)}
          >
            <span className={index === 1 ? "text-white" : "text-white/55"}>
              {tab}
            </span>
          </m.span>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-[16px] bg-[#0b0c11] p-3 ring-1 ring-white/[0.06]">
        {SAVED.map((name, index) => (
          <m.div
            key={name}
            className="flex h-14 items-center gap-3 rounded-[12px] bg-white/[0.05] px-4"
            initial={{ opacity: 0, y: 10 }}
            animate={tabbed ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={land(tabbed, 0.95 + index * 0.1)}
          >
            <IconFileText size={18} aria-hidden className="text-white/55" />
            <span className="flex-1 text-base text-white/85">{name}</span>
            <IconLink size={16} aria-hidden className="text-[#3B7DD8]" />
          </m.div>
        ))}
      </div>
      <m.div
        className="m-2 flex h-11 items-center rounded-full bg-white/[0.06] pr-1 pl-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: tabbed ? 1 : 0 }}
        transition={tabbed ? { duration: 0.4, delay: 0.5 } : LEAVE}
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
      <Kicker>Artifacts</Kicker>
      <Title size="md">
        Pages you can <Accent>just open</Accent>.
      </Title>
      <Body className="mt-4 max-w-3xl">
        The agent saves a page. You get a link.
      </Body>

      <div className="flex flex-1 items-center justify-center pb-10">
        <m.div
          className="flex items-center"
          style={{ gap: GAP }}
          initial={false}
          animate={{ x: tabbed ? 0 : CENTRE_OFFSET }}
          transition={tabbed ? GROW : SETTLE}
        >
          <div className="flex justify-center" style={{ width: PAGE_WIDTH }}>
            <PageFrame hosted={hosted} />
          </div>
          <ChatTabs tabbed={tabbed} />
        </m.div>
      </div>

      <Footnote>
        Hosted artifacts landed 17 June 2026. Every chat gained its own
        Artifacts and Documents tabs on 12 September 2026.
      </Footnote>
    </Shell>
  );
}
