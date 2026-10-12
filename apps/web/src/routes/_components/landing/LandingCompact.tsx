"use client";

import { SignInButton } from "@clerk/clerk-react";
import { IconArrowRight } from "@tabler/icons-react";
import { Button } from "@eva/ui";
import { EvaIcon } from "@/lib/components/EvaIcon";
import { BrandMark } from "./BrandMark";
import {
  LANDING_HERO_CAPABILITIES,
  LANDING_PILLARS,
  LANDING_STACK,
} from "./landingContent";

/**
 * The marketing page when `VITE_NEW_LANDING` is off.
 *
 * One screen of content rather than the full page's long scroll: the same
 * headline, the four stages of the workflow with their features named, and the
 * stack. It reads from `landingContent.ts` like the full page does, so copy
 * stays in one file and neither version can drift from the other.
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
      <header className="border-b border-border">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <span className="flex items-center gap-2.5">
            <EvaIcon size={24} label={null} className="size-6 rounded-full" />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Eva
            </span>
          </span>

          <SignInButton mode="modal">
            <Button size="sm">Sign in</Button>
          </SignInButton>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Your AI coworker ships pull requests.
        </h1>

        <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">
          Eva gives coding agents a real cloud dev environment — your repository
          cloned, dependencies installed, a dev server running and a browser
          they can drive. They run the tests and open the pull request.
        </p>

        <ul className="mt-6 flex flex-wrap items-center gap-1.5">
          {LANDING_HERO_CAPABILITIES.map((capability) => (
            <li
              key={capability}
              className="rounded-full border border-border bg-card/60 px-2.5 py-1 font-mono text-2xs text-muted-foreground"
            >
              {capability}
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <SignInButton mode="modal">
            <Button size="lg" className="w-full sm:w-auto sm:min-w-40">
              Sign in
              <IconArrowRight size={16} aria-hidden />
            </Button>
          </SignInButton>
        </div>

        {/*
          The whole product, four stages deep, without a single mock panel. One
          column per stage on a wide screen so the four fit on one row and the
          page stays roughly a screen tall; the hairlines between them are the
          `gap-px` over a `bg-border` fill.
        */}
        <ul className="mt-12 grid gap-px overflow-hidden rounded-surface border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {LANDING_PILLARS.map((pillar) => (
            <li key={pillar.id} className="bg-background p-5">
              <p className="font-mono text-2xs uppercase tracking-[0.22em] text-muted-foreground/70">
                {pillar.step} · {pillar.label}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {pillar.tagline}
              </p>
              <dl className="mt-4 space-y-3">
                {pillar.features.map((feature) => (
                  <div key={feature.name} className="text-2sm leading-snug">
                    <dt className="flex items-center gap-1.5 font-medium text-foreground">
                      <feature.icon
                        size={15}
                        className="shrink-0 text-muted-foreground"
                      />
                      {feature.name}
                    </dt>
                    <dd className="mt-0.5 pl-[1.3rem] text-muted-foreground">
                      {feature.summary}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Eva</span> — built on
          </p>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
