"use client";

import { useNavigate } from "@tanstack/react-router";
import { Button } from "@vvedantb/ui";
import { newLandingEnabled } from "@/env/client";
import { LandingCompact } from "./landing/LandingCompact";
import { LandingCta } from "./landing/LandingCta";
import { LandingFooter } from "./landing/LandingFooter";
import { LandingHero } from "./landing/LandingHero";
import { LandingMcp } from "./landing/LandingMcp";
import { LandingNav } from "./landing/LandingNav";
import { LandingOpenSource } from "./landing/LandingOpenSource";
import { LandingPillarSection } from "./landing/LandingPillarSection";
import { LandingSandbox } from "./landing/LandingSandbox";
import { LandingWorkflow } from "./landing/LandingWorkflow";
import { LANDING_PILLARS } from "./landing/landingContent";

const isDev = import.meta.env.DEV;

interface LandingPageProps {
  agentRedirect?: boolean;
}

/**
 * Marketing page. Thin orchestrator — every section owns its own copy and
 * layout, and all strings live in `landing/landingContent.ts`.
 *
 * `VITE_NEW_LANDING` picks between this and `LandingCompact`. Both read the
 * same content file, so the choice is one of depth, not of message: the full
 * page walks through each feature with a live mock, the compact one names them
 * all on a single screen.
 */
export function LandingPage({ agentRedirect }: LandingPageProps) {
  // `?agent` is mid-redirect to the agent login route; render a blank canvas
  // rather than flashing the whole marketing page.
  if (agentRedirect) {
    return <div className="min-h-dvh w-full bg-background" />;
  }

  if (!newLandingEnabled) {
    return (
      <>
        <LandingCompact />
        <AgentSignIn />
      </>
    );
  }

  return (
    <div id="top" className="min-h-dvh bg-background">
      <LandingNav />

      <main>
        <LandingHero />
        <LandingWorkflow />

        {LANDING_PILLARS.map((pillar) => (
          <LandingPillarSection key={pillar.id} pillar={pillar} />
        ))}

        <LandingSandbox />
        <LandingMcp />
        <LandingOpenSource />
        <LandingCta />
      </main>

      <LandingFooter />

      <AgentSignIn />
    </div>
  );
}

/**
 * Dev-only shortcut into the agent account, rendered by both versions of the
 * page so switching `VITE_NEW_LANDING` never takes it away.
 */
function AgentSignIn() {
  const navigate = useNavigate();

  if (!isDev) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        size="sm"
        variant="outline"
        className="shadow-lg"
        onClick={() => {
          navigate({ to: "/", search: { agent: true } });
        }}
      >
        Sign in as Eva
      </Button>
    </div>
  );
}
