"use client";

import { SignInButton } from "@clerk/clerk-react";
import { IconArrowRight } from "@tabler/icons-react";
import { Button, cn } from "@eva/ui";
import { BrandMark } from "./BrandMark";
import { LandingBrand } from "./LandingBrand";
import {
  LANDING_AGENTS,
  LANDING_HERO,
  LANDING_HERO_CAPABILITIES,
  LANDING_PILLARS,
  LANDING_STACK,
} from "./landingContent";
import {
  LANDING_CARD,
  LandingCapabilityLine,
  LandingEyebrow,
  LandingHeadline,
} from "./LandingPrimitives";

/**
 * The marketing page when `VITE_NEW_LANDING` is off.
 *
 * One screen of content rather than the full page's long scroll: the same
 * headline, the four stages of the workflow with their features named, and the
 * stack. It reads from `landingContent.ts` and `LandingPrimitives.tsx` like the
 * full page does, so copy and type stay in one place and neither version can
 * drift from the other.
 *
 * Deliberately static — no previews, no motion, no auto-cycling tabs. Anything
 * that needed those belongs on the full page.
 *
 * Sign-in is the only call to action here. There is no sign-up, no link to the
 * repository and no licence line — the full page carries all of that, and this
 * version is for instances that want a door rather than a pitch.
 */
export function LandingCompact() {
  return (
    <div id="top" className="flex min-h-dvh flex-col bg-background">
      <div className="landing-atmosphere landing-grain relative overflow-hidden">
        <div aria-hidden className="landing-grid" />

        <header className="relative z-10 px-3 pt-3 sm:px-5">
          <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 rounded-full bg-background/70 pl-4 pr-2 ring-1 ring-border/70 backdrop-blur-md sm:pl-5">
            <LandingBrand />
            <SignInButton mode="modal">
              <Button size="sm" className="rounded-full px-4">
                Sign in
              </Button>
            </SignInButton>
          </nav>
        </header>

        <section className="relative z-10 mx-auto grid w-full max-w-6xl gap-12 px-5 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-24 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end lg:gap-16 lg:px-10">
          <div>
            <LandingHeadline className="lg:text-6xl" />
            <p className="mt-7 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              {LANDING_HERO.lede}
            </p>
            <div className="mt-10">
              <SignInButton mode="modal">
                <Button
                  size="lg"
                  className="group w-full rounded-full px-7 sm:w-auto"
                >
                  Sign in
                  <IconArrowRight
                    size={16}
                    aria-hidden
                    className="motion-base group-hover:translate-x-0.5"
                  />
                </Button>
              </SignInButton>
            </div>
          </div>

          <div className={cn(LANDING_CARD, "bg-card/80 p-6 backdrop-blur-sm")}>
            <p className="text-xs text-muted-foreground">In every sandbox</p>
            <LandingCapabilityLine
              items={LANDING_HERO_CAPABILITIES}
              className="mt-3 text-foreground"
            />
            <p className="mt-6 text-xs text-muted-foreground">
              Bring your agent
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {LANDING_AGENTS.map((agent) => (
                <li
                  key={agent}
                  className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground"
                >
                  {agent}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-16 pt-4 sm:px-8 lg:px-10">
        <LandingEyebrow>How it works</LandingEyebrow>

        {/*
          The whole product, four stages deep, without a single mock panel. One
          column per stage on a wide screen so the four fit on one row and the
          page stays roughly a screen tall.
        */}
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LANDING_PILLARS.map((pillar) => (
            <li key={pillar.id} className={cn(LANDING_CARD, "p-6")}>
              <div className="flex items-baseline gap-3">
                <span className="landing-display text-3xl font-semibold tabular-nums text-foreground/20">
                  {pillar.step}
                </span>
                <span className="text-lg font-semibold tracking-tight text-foreground">
                  {pillar.label}
                </span>
              </div>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                {pillar.tagline}
              </p>
              <dl className="mt-6 space-y-4 border-t border-border/60 pt-5">
                {pillar.features.map((feature) => (
                  <div key={feature.name} className="text-2sm leading-snug">
                    <dt className="flex items-center gap-2 font-medium text-foreground">
                      <feature.icon
                        size={15}
                        className="shrink-0 text-muted-foreground"
                      />
                      {feature.name}
                    </dt>
                    <dd className="mt-1 pl-5.75 text-muted-foreground">
                      {feature.summary}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p className="text-sm text-muted-foreground">Built on</p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LANDING_STACK.map((item) => (
              <li
                key={item.name}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <BrandMark name={item.brand} size={14} />
                {item.name}
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  );
}
