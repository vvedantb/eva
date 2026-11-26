import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { IconDeviceDesktop } from "@tabler/icons-react";
import { cn } from "@eva/ui";
import { BorderBeam, Button, tokenTransition } from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { DESKTOP_PORT, isAgentBrowsingActive } from "@eva/shared";
import {
  SandboxIframeService,
  type StartResult,
} from "@/lib/components/sandbox/SandboxIframeService";
import type { SandboxWake } from "@/lib/components/sandbox/SandboxAsleepState";

interface DesktopPanelProps {
  cacheKey: string;
  sandboxId: string | undefined;
  isActive: boolean;
  repoId: Id<"githubRepos">;
  surface?: "browser" | "desktop";
  agentBrowsingAt?: number;
  onReleaseLock?: () => void;
  externalHref?: string;
  wake?: SandboxWake;
}

const SURFACE_COPY = {
  browser: {
    inactiveLabel: "Wake Eva up to use the browser",
    idleLabel: "Browser is not running",
    startLabel: "Start Browser",
    startingLabel: "Starting browser environment...",
    pollFailedError: "Browser failed to start. Check sandbox logs.",
    startFailedError: "Failed to start browser",
    loadFailedError: "Failed to load browser",
  },
  desktop: {
    inactiveLabel: "Wake Eva up to use Computer",
    idleLabel: "Computer is not running",
    startLabel: "Start Computer",
    startingLabel: "Starting Computer...",
    pollFailedError: "Computer failed to start. Check sandbox logs.",
    startFailedError: "Failed to start Computer",
    loadFailedError: "Failed to load Computer",
  },
} as const;

function appendNoVncParams(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = url.pathname.replace(/\/?$/, "/vnc_lite.html");
  url.searchParams.set("autoconnect", "true");
  url.searchParams.set("scale", "true");
  url.searchParams.set("quality", "6");
  url.searchParams.set("compression", "2");
  const grant = url.searchParams.get("__eva_grant");
  if (grant) {
    url.searchParams.set("path", "websockify?__eva_grant=" + grant);
  }
  return url.toString();
}

export function DesktopPanel({
  cacheKey,
  sandboxId,
  isActive,
  repoId,
  surface = "desktop",
  agentBrowsingAt,
  onReleaseLock,
  externalHref,
  wake,
}: DesktopPanelProps) {
  const copy = SURFACE_COPY[surface];
  const toggleDesktopServer = useAction(api.sandbox.toggleDesktopServer);
  const launchChromeInDesktop = useAction(api.sandbox.launchChromeInDesktop);

  const startAction = async (): Promise<StartResult> => {
    if (!sandboxId) return { success: false, message: "No sandbox" };
    await toggleDesktopServer({ sandboxId, repoId, action: "start" });
    return { success: true };
  };

  const stopAction = async () => {
    if (!sandboxId) return;
    await toggleDesktopServer({ sandboxId, repoId, action: "stop" });
  };

  const handleReady = () => {
    if (!sandboxId) return;
    launchChromeInDesktop({ sandboxId, repoId }).catch(() => {});
  };

  const isAgentBrowsing = isAgentBrowsingActive(agentBrowsingAt);

  const autoStartKey = isAgentBrowsing ? agentBrowsingAt : undefined;

  const showLockOverlay = onReleaseLock !== undefined && isAgentBrowsing;
  const beamPane = surface === "browser" && showLockOverlay;

  const handleTakeControl = () => {
    onReleaseLock?.();
  };

  return (
    <div className="relative h-full min-h-0">
      <SandboxIframeService
        cacheNamespace="desktop-scale"
        cacheKey={cacheKey}
        sandboxId={sandboxId}
        isActive={isActive}
        repoId={repoId}
        port={DESKTOP_PORT}
        startAction={startAction}
        stopAction={stopAction}
        transformUrl={appendNoVncParams}
        onReady={handleReady}
        ensureStartedBeforeReady
        maxAttempts={40}
        icon={IconDeviceDesktop}
        inactiveLabel={copy.inactiveLabel}
        idleLabel={copy.idleLabel}
        startLabel={copy.startLabel}
        startingLabel={copy.startingLabel}
        pollFailedError={copy.pollFailedError}
        startFailedError={copy.startFailedError}
        loadFailedError={copy.loadFailedError}
        iframeAllow="clipboard-read; clipboard-write"
        autoStartKey={autoStartKey}
        externalHref={externalHref}
        wake={wake}
      />
      {showLockOverlay ? (
        <>
          <div
            className={cn(
              "absolute inset-0 z-10 cursor-not-allowed",
              beamPane ? null : "ring-[3px] ring-inset ring-primary/70",
            )}
          />
        </>
      ) : null}
      <AnimatePresence initial={false}>
        {showLockOverlay ? (
          <m.div
            className="absolute top-3 left-1/2 z-20 -translate-x-1/2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={tokenTransition.fast}
          >
            <BorderBeam
              active={beamPane}
              colorVariant="colorful"
              className="rounded-full"
            >
              <div className="relative flex items-center gap-2 rounded-full bg-primary py-1.5 pr-1.5 pl-4 text-sm font-medium text-primary-foreground smooth-shadow-lg">
                <span>Agent is browsing</span>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={handleTakeControl}
                >
                  Take control
                </Button>
              </div>
            </BorderBeam>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
