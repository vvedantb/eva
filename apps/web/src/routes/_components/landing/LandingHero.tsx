"use client";

import { SignUpButton } from "@clerk/clerk-react";
import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";
import { m, type Variants } from "motion/react";
import { Button } from "@vvedantb/ui";
import { LandingTaskDetailMock } from "../LandingTaskDetailMock";
import {
  EVA_GITHUB_URL,
  LANDING_AGENTS,
  LANDING_HERO,
  LANDING_HERO_CAPABILITIES,
} from "./landingContent";
import {
  LANDING_EASE,
  LandingCapabilityLine,
  LandingHeadline,
} from "./LandingPrimitives";

const HERO_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
};

const HERO_ITEM: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: LANDING_EASE },
  },
};

const MOCK_ITEM: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.8, ease: LANDING_EASE, delay: 0.24 },
  },
};

/**
 * Centred hero with the product mock underneath. The mock is the real
 * task-detail UI rendered from fixtures, not a screenshot, so it stays in step
 * with the design system and both themes. It sits on a raised stage with a
 * static glow behind it, and the agents row below names what runs inside.
 */
export function LandingHero() {
  return (
    <div className="landing-atmosphere landing-grain relative -mt-20 overflow-hidden pt-20">
      <div aria-hidden className="landing-grid" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-linear-to-b from-transparent to-background"
      />

      <m.div
        variants={HERO_CONTAINER}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24 lg:px-10"
      >
        <div className="flex flex-col items-center text-center">
          <m.a
            variants={HERO_ITEM}
            href={EVA_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="motion-base group inline-flex items-center gap-2 rounded-full bg-card/80 py-1 pl-1 pr-3 text-xs text-muted-foreground ring-1 ring-border backdrop-blur-sm hover:text-foreground"
          >
            <span className="rounded-full bg-primary px-2 py-0.5 text-3xs font-semibold uppercase tracking-wider text-primary-foreground">
              MIT
            </span>
            Open source and free to self-host
            <IconArrowRight
              size={13}
              aria-hidden
              className="motion-base group-hover:translate-x-0.5"
            />
          </m.a>

          <m.div variants={HERO_ITEM} className="mt-8 max-w-4xl">
            <LandingHeadline />
          </m.div>

          <m.p
            variants={HERO_ITEM}
            className="mt-7 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            {LANDING_HERO.lede}
          </m.p>

          <m.div
            variants={HERO_ITEM}
            className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center"
          >
            <SignUpButton mode="modal">
              <Button
                size="lg"
                className="group w-full rounded-full px-6 sm:w-auto"
              >
                Get started
                <IconArrowRight
                  size={16}
                  aria-hidden
                  className="motion-base group-hover:translate-x-0.5"
                />
              </Button>
            </SignUpButton>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="w-full rounded-full px-5 sm:w-auto"
            >
              <a href={EVA_GITHUB_URL} target="_blank" rel="noreferrer">
                <IconBrandGithub size={16} aria-hidden />
                Star on GitHub
              </a>
            </Button>
          </m.div>

          <m.div variants={HERO_ITEM} className="mt-10">
            <LandingCapabilityLine
              items={LANDING_HERO_CAPABILITIES}
              className="justify-center"
            />
          </m.div>
        </div>

        <m.div
          variants={MOCK_ITEM}
          className="relative mx-auto mt-16 max-w-4xl"
        >
          <div
            aria-hidden
            className="landing-glow -inset-x-16 -top-10 bottom-1/3"
          />
          <div className="relative rounded-surface bg-card/60 p-2 smooth-shadow-ring-xl backdrop-blur-sm">
            <LandingTaskDetailMock />
          </div>
        </m.div>

        <m.div
          variants={HERO_ITEM}
          className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-6"
        >
          <p className="text-xs text-muted-foreground">
            Bring the agent you already use
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-2">
            {LANDING_AGENTS.map((agent) => (
              <li
                key={agent}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground"
              >
                {agent}
              </li>
            ))}
          </ul>
        </m.div>
      </m.div>
    </div>
  );
}
