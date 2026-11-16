"use client";

import { LandingTaskDetailMock } from "../LandingTaskDetailMock";
import { LANDING_AGENTS } from "./landingContent";
import { LandingReveal } from "./LandingPrimitives";

/**
 * The product mock, directly below the hero. It is the real task-detail UI
 * rendered from fixtures, not a screenshot, so it stays in step with the design
 * system and both themes. It sits on a raised stage with a static glow behind
 * it, and the agents row below names what runs inside.
 */
export function LandingPreview() {
  return (
    <section className="mx-auto w-full max-w-6xl overflow-x-clip px-5 pb-20 sm:px-8 sm:pb-28 lg:px-10">
      <LandingReveal>
        <div className="relative mx-auto max-w-4xl">
          <div
            aria-hidden
            className="landing-glow -inset-x-16 -top-10 bottom-1/3"
          />
          <div className="relative rounded-surface bg-card/60 p-2 smooth-shadow-ring-xl backdrop-blur-sm">
            <LandingTaskDetailMock />
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-6">
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
        </div>
      </LandingReveal>
    </section>
  );
}
