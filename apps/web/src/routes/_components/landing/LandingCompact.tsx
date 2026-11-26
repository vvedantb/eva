"use client";

import { SignInButton } from "@clerk/clerk-react";
import { cn } from "@eva/ui";
import { Button, FloatingBar } from "@vvedantb/ui";
import { LandingBrand } from "./LandingBrand";
import { LandingHero } from "./LandingHero";
import { markLandingRoot } from "./markLandingRoot";
import { LANDING_PILLARS } from "./landingContent";
import { LANDING_CARD, LandingEyebrow } from "./LandingPrimitives";

/**
 * The marketing page when `VITE_NEW_LANDING` is off.
 *
 * One screen of content rather than the full page's long scroll: the hero and
 * the four stages of the workflow with their features named. It reads from
 * `landingContent.ts` and `LandingPrimitives.tsx` like the full page does, so
 * copy and type stay in one place and neither version can drift from the other.
 *
 * Deliberately static — no previews, no motion, no auto-cycling tabs, no
 * footer. Anything that needed those belongs on the full page.
 *
 * The hero is the shared `ProductHero` with a short plain-words lede. Sign-in
 * is the only call to action here. There is no sign-up, no link to the
 * repository and no licence line — the full page carries all of that, and this
 * version is for instances that want a door rather than a pitch.
 */
export function LandingCompact() {
  return (
    <div
      id="top"
      ref={markLandingRoot}
      className="flex min-h-dvh flex-col bg-background"
    >
      <div className="landing-atmosphere landing-grain relative overflow-hidden">
        <div aria-hidden className="landing-grid" />

        <FloatingBar barClassName="justify-between gap-4 pl-5">
          <LandingBrand />
          <SignInButton mode="modal">
            <Button size="sm" className="rounded-full px-4">
              Sign in
            </Button>
          </SignInButton>
        </FloatingBar>

        <div className="relative z-10">
          <LandingHero compact />
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-16 pt-4 sm:px-8 lg:px-10">
        <LandingEyebrow>How it works</LandingEyebrow>

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
    </div>
  );
}
