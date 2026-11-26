import { createFileRoute, notFound } from "@tanstack/react-router";
import { useAuth, RedirectToSignIn } from "@clerk/clerk-react";
import { useAction, useConvex, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@eva/backend";
import { Button, Spinner } from "@vvedantb/ui";
import {
  DEFAULT_PREVIEW_PORT,
  PREVIEW_WAKE_KINDS,
  previewWakeSearchSchema,
  type PreviewWakeKind,
} from "@eva/shared";
import { buildUrlWithPath } from "@/lib/components/PreviewNavBar";

/** Same cadence as the Preview pane's readiness poll (useSandboxPreview). */
const READY_POLL_MS = 3_000;
/** Mirrors TASK_PREVIEW_SANDBOX_READY_TIMEOUT_MS on the backend. */
const WAKE_TIMEOUT_MS = 240_000;

function isWakeKind(value: string): value is PreviewWakeKind {
  return PREVIEW_WAKE_KINDS.some((kind) => kind === value);
}

/**
 * Stable preview link: `/p/session/<id>?port=3000&path=/foo`. Unlike the raw
 * sandbox domain this survives the sandbox being paused (idle pause) or even
 * recreated, because it is keyed by the chat entity. An active sandbox goes
 * straight to its domain with a fresh grant. Otherwise the route brings the
 * sandbox up through the same Start mutation the UI button uses, waits for the
 * dev server to answer, then hands off to the sandbox's own domain with a fresh
 * preview grant — the handshake `/preview-auth` does for cold links.
 *
 * The handshake runs once per attempt and reads the entity imperatively
 * (`convex.query`) on every poll. It deliberately does not depend on the live
 * `useQuery` document: status/updatedAt churn during the wake would otherwise
 * re-run the effect, cancel the in-flight poll, and hang the page.
 */
export const Route = createFileRoute("/p/$kind/$id")({
  validateSearch: (search: Record<string, unknown>) =>
    previewWakeSearchSchema.parse(search),
  beforeLoad: ({ params }) => {
    if (!isWakeKind(params.kind)) throw notFound();
  },
  component: PreviewWake,
});

type Phase =
  | { kind: "opening" }
  | { kind: "waking" }
  | { kind: "serving" }
  | { kind: "error"; message: string };

function PreviewWake() {
  const { isLoaded, isSignedIn } = useAuth();
  const { kind, id } = Route.useParams();
  const search = Route.useSearch();
  const wakeKind: PreviewWakeKind = isWakeKind(kind) ? kind : "session";
  const ensureActive = useAction(api.sandboxWake.ensureEntitySandboxActive);
  const getPreviewUrl = useAction(api.sandbox.getPreviewUrl);
  const convex = useConvex();
  const [phase, setPhase] = useState<Phase>({ kind: "opening" });
  const [attempt, setAttempt] = useState(0);
  const ran = useRef<number>(-1);

  // Live document for the progress copy and to know whether the link resolves.
  // The handshake below does NOT depend on it — see the component doc.
  const target = useQuery(
    api.sandboxWake.getWakeTarget,
    isSignedIn ? { kind: wakeKind, id } : "skip",
  );
  const targetLoaded = target !== undefined;
  const targetMissing = target === null;
  const sandboxStatus = target?.status;

  /* eslint-disable no-effect/no-event-handler, no-effect/no-external-store-subscription --
     Page-level handshake like /preview-auth: the trigger is landing on the
     route (plus sign-in settling), not a click. One run per attempt;
     `attempt` is the local retry counter, not an external store. */
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !targetLoaded) return;
    if (targetMissing) {
      setPhase({
        kind: "error",
        message: "This preview link points to a chat you cannot see.",
      });
      return;
    }
    if (ran.current === attempt) return;
    ran.current = attempt;
    let cancelled = false;
    const deadline = Date.now() + WAKE_TIMEOUT_MS;
    const readTarget = () =>
      convex.query(api.sandboxWake.getWakeTarget, { kind: wakeKind, id });

    const waitForDevServer = async (): Promise<void> => {
      while (!cancelled && Date.now() < deadline) {
        // Fresh read each poll: the sandbox id changes if a dead sandbox is
        // recreated during the wake.
        const fresh = await readTarget();
        if (cancelled) return;
        if (fresh === null) {
          setPhase({
            kind: "error",
            message: "This preview link points to a chat you cannot see.",
          });
          return;
        }
        const { sandboxId, repoId } = fresh;
        if (!sandboxId || !repoId) {
          setPhase({
            kind: "error",
            message: "This chat has no sandbox to wake yet.",
          });
          return;
        }
        const preview = await getPreviewUrl({
          sandboxId,
          repoId,
          port: search.port ?? fresh.devPort ?? DEFAULT_PREVIEW_PORT,
          checkReady: true,
        });
        if (cancelled) return;
        if (preview.ready && preview.url.length > 0) {
          setPhase({ kind: "serving" });
          // Cross-origin navigation to the sandbox origin — the full-page
          // location API, not the SPA router (same as /preview-auth).
          window.location.replace(
            buildUrlWithPath(preview.url, search.path ?? "/"),
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
      }
      if (!cancelled) {
        setPhase({
          kind: "error",
          message:
            "The dev server did not answer in time. Open the chat in Eva to see what it is doing.",
        });
      }
    };

    // Fast path: a sandbox that is already up needs no wake and no readiness
    // probe. `getPreviewUrl` without `checkReady` still starts the auth proxy
    // when it is not running (nothing else does after a resume), then returns
    // the URL with a fresh grant. If the dev server is down the preview page
    // says so itself. Retries skip this and run the full wake.
    const openActive = async (): Promise<boolean> => {
      if (attempt > 0) return false;
      const fresh = await readTarget();
      if (cancelled || fresh?.status !== "active" || !fresh.sandboxId) {
        return false;
      }
      const preview = await getPreviewUrl({
        sandboxId: fresh.sandboxId,
        repoId: fresh.repoId,
        port: search.port ?? fresh.devPort ?? DEFAULT_PREVIEW_PORT,
      });
      if (cancelled) return true;
      if (preview.url.length === 0) return false;
      setPhase({ kind: "serving" });
      window.location.replace(buildUrlWithPath(preview.url, search.path ?? "/"));
      return true;
    };

    const wake = async () => {
      setPhase({ kind: "waking" });
      await ensureActive({ kind: wakeKind, id });
      if (cancelled) return;
      await waitForDevServer();
    };

    openActive()
      .catch(() => false)
      .then((opened) => (opened || cancelled ? undefined : wake()))
      .catch((err: Error) => {
        if (cancelled) return;
        setPhase({
          kind: "error",
          message: err.message || "Eva could not wake this sandbox.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    isLoaded,
    isSignedIn,
    attempt,
    targetLoaded,
    targetMissing,
    wakeKind,
    id,
    search.port,
    search.path,
    ensureActive,
    getPreviewUrl,
    convex,
  ]);
  /* eslint-enable no-effect/no-event-handler, no-effect/no-external-store-subscription */

  if (isLoaded && !isSignedIn) {
    return (
      <RedirectToSignIn
        signInForceRedirectUrl={
          typeof window !== "undefined" ? window.location.href : "/"
        }
      />
    );
  }

  // Opening an active sandbox is a quick handoff: keep the page blank. Only a
  // real wake (seconds to minutes) or an error shows anything.
  if (phase.kind === "opening" || phase.kind === "serving") return null;

  const statusText =
    phase.kind === "error"
      ? phase.message
      : sandboxStatus === "active"
        ? "Starting the dev server…"
        : "Waking Eva up…";

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      {phase.kind === "error" ? null : <Spinner size="lg" />}
      <p className="text-sm text-muted-foreground">{statusText}</p>
      {phase.kind === "error" ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setPhase({ kind: "waking" });
            setAttempt((n) => n + 1);
          }}
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}
