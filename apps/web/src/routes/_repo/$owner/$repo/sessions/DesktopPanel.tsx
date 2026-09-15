import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { IconDeviceDesktop } from "@tabler/icons-react";
import { BorderBeam, Button, cn, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import {
  SandboxIframeService,
  type StartResult,
} from "@/lib/components/sandbox/SandboxIframeService";

const AGENT_BROWSING_LOCK_TTL_MS = 30 * 60 * 1000;

interface DesktopPanelProps {
  cacheKey: string;
  sandboxId: string | undefined;
  isActive: boolean;
  repoId: Id<"githubRepos">;
  /** Browser tab vs Computer tab — same surface, different idle copy. */
  surface?: "browser" | "desktop";
  /** When fresh, shows the takeover overlay (session/task/project sandboxes). */
  agentBrowsingAt?: number;
  /**
   * Clears the agent-browsing soft lock (session/task/project-specific
   * mutation, provided by the caller). Takeover overlay only renders when set.
   */
  onReleaseLock?: () => void;
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

/**
 * NoVNC remote-desktop panel. Thin wrapper around `SandboxIframeService` —
 * port 6080, transforms the preview URL into a vnc_lite.html viewer URL, and
 * fires `launchChromeInDesktop` once the viewer is ready.
 *
 * Forwards `__eva_grant` onto noVNC's websockify `path` so the auth proxy can
 * authorize the WebSocket upgrade even when the Partitioned session cookie is
 * missing in a cross-site iframe (Eva app → *.vercel.run).
 *
 * Shared by Browser (first-class) and Computer (`+` menu) tabs — same Chrome.
 */
function appendNoVncParams(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = url.pathname.replace(/\/?$/, "/vnc_lite.html");
  url.searchParams.set("autoconnect", "true");
  // vnc_lite.html reads `scale` (→ rfb.scaleViewport), not the full client's
  // `resize=scale`. Without this the 1920×1080 desktop renders 1:1 and looks
  // zoomed/cropped inside the panel; with it, aspect ratio is preserved.
  url.searchParams.set("scale", "true");
  url.searchParams.set("quality", "6");
  url.searchParams.set("compression", "2");
  const grant = url.searchParams.get("__eva_grant");
  if (grant) {
    // searchParams.set encodes once; do not pre-encode the grant.
    url.searchParams.set("path", "websockify?__eva_grant=" + grant);
  }
  return url.toString();
}

function isAgentBrowsingActive(agentBrowsingAt: number | undefined): boolean {
  if (agentBrowsingAt === undefined) return false;
  return Date.now() - agentBrowsingAt < AGENT_BROWSING_LOCK_TTL_MS;
}

export function DesktopPanel({
  cacheKey,
  sandboxId,
  isActive,
  repoId,
  surface = "desktop",
  agentBrowsingAt,
  onReleaseLock,
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

  // The agent only takes the browsing lock after `browser_start`, so Chrome is
  // already up — auto-start (start + readiness poll) instead of asking the user
  // to press Start for something they can see is running.
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
        port={6080}
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
      />
      {showLockOverlay ? (
        <>
          {/* Browser pane: the colorful composer beam replaces the inset
              ring. Computer keeps FollowOverlay's static ring — same Chrome,
              different tab. Overlay so the iframe stays visible through the
              masked hole; the click layer still swallows taps. */}
          {beamPane ? (
            <BorderBeam
              active
              colorVariant="colorful"
              className="beam-inset pointer-events-none absolute inset-0 z-10"
            >
              {null}
            </BorderBeam>
          ) : null}
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
            transition={motionFast}
          >
            <div className="flex items-center gap-2 rounded-full bg-primary py-1.5 pr-1.5 pl-4 text-sm font-medium text-primary-foreground smooth-shadow-lg">
              <span>Agent is browsing</span>
              <Button
                size="xs"
                variant="secondary"
                className="rounded-full"
                onClick={handleTakeControl}
              >
                Take control
              </Button>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
