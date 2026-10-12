"use client";

import { SignUpButton } from "@clerk/clerk-react";
import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";
import { m, type Variants } from "motion/react";
import { Button } from "@eva/ui";
import { LandingTaskDetailMock } from "../LandingTaskDetailMock";
import { EVA_GITHUB_URL, LANDING_HERO_CAPABILITIES } from "./landingContent";

const LANDING_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

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
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: LANDING_EASE, delay: 0.24 },
  },
};

/**
 * Centred hero with the product mock underneath. The mock is the real
 * task-detail UI rendered from fixtures, not a screenshot, so it stays in step
 * with the design system and both themes.
 */
export function LandingHero() {
  const item = HERO_ITEM;
  const mock = MOCK_ITEM;

  return (
    <div className="landing-atmosphere landing-grain relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-background"
      />

      <m.div
        variants={HERO_CONTAINER}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-24 lg:px-10"
      >
        <div className="flex flex-col items-center text-center">
          <m.a
            variants={item}
            href={EVA_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="motion-base inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <span className="landing-pulse-dot size-1.5 rounded-full bg-primary" />
            Open source and MIT licensed
            <IconArrowRight size={13} aria-hidden />
          </m.a>

          <m.h1
            variants={item}
            className="landing-display mt-7 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] text-foreground sm:text-5xl lg:text-6xl"
          >
            Your AI coworker ships pull requests.
          </m.h1>

          <m.p
            variants={item}
            className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Eva gives coding agents a real cloud dev environment â€” your
            repository cloned, dependencies installed, a dev server running and
            a browser they can drive. They run the tests and open the pull
            request.
          </m.p>

          <m.div
            variants={item}
            className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center"
          >
            <SignUpButton mode="modal">
              <Button size="lg" className="w-full sm:w-auto sm:min-w-40">
                Get started
                <IconArrowRight size={16} aria-hidden />
              </Button>
            </SignUpButton>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
            >
              <a href={EVA_GITHUB_URL} target="_blank" rel="noreferrer">
                <IconBrandGithub size={16} aria-hidden />
                View on GitHub
              </a>
            </Button>
          </m.div>

          <m.ul
            variants={item}
            className="mt-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-2"
          >
            {LANDING_HERO_CAPABILITIES.map((capability) => (
              <li
                key={capability}
                className="rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-2xs text-muted-foreground"
              >
                {capability}
              </li>
            ))}
          </m.ul>
        </div>

        <m.div variants={mock} className="mx-auto mt-16 max-w-3xl">
          <LandingTaskDetailMock />
        </m.div>
      </m.div>
    </div>
  );
}
