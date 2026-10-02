import { createFileRoute, notFound } from "@tanstack/react-router";
import { useAuth, RedirectToSignIn } from "@clerk/clerk-react";
import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@eva/backend";
import { Button, Spinner } from "@eva/ui";
import {
  PREVIEW_WAKE_KINDS,
  previewWakeSearchSchema,
  type PreviewWakeKind,
} from "@eva/shared";
import { buildUrlWithPath } from "@/lib/components/PreviewNavBar";

const DEFAULT_PREVIEW_PORT = 3000;
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
 * recreated, because it is keyed by the chat entity. The route brings the
 * sandbox up through the same Start mutation the UI button uses, waits for the
 * dev server to answer, then hands off to the sandbox's own domain with a fresh
 * preview grant — the handshake `/preview-auth` does for cold links.
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
  const [phase, setPhase] = useState<Phase>({ kind: "waking" });
  const [attempt, setAttempt] = useState(0);
  const ran = useRef<number>(-1);

  // Live status for the progress copy and the sandbox id to poll. The id can
  // change if a dead sandbox had to be recreated, so it is read live, not at
  // mount.
  const target = useQuery(
    api.sandboxWake.getWakeTarget,
    isSignedIn ? { kind: wakeKind, id } : "skip",
  );
  const sandboxId = target?.sandboxId;
  const repoId = target?.repoId;
  const devPort = target?.devPort;
  const sandboxStatus = target?.status;

  /* eslint-disable no-effect/no-event-handler --
     Page-level handshake like /preview-auth: the trigger is landing on the
     route (plus sign-in settling), not a click. One run per attempt. */
  useEffect(() => {
    if (!isLoaded || !isSignedIn || ran.current === attempt) return;
    if (target === undefined) return;
    if (target === null) {
      setPhase({
        kind: "error",
        message: "This preview link points to a chat you cannot see.",
      });
      return;
    }
    ran.current = attempt;
    let cancelled = false;
    const deadline = Date.now() + WAKE_TIMEOUT_MS;
    const port = search.port ?? devPort ?? DEFAULT_PREVIEW_PORT;

    const waitForDevServer = async (): Promise<void> => {
      while (!cancelled && Date.now() < deadline) {
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
          port,
          checkReady: true,
        });
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

    ensureActive({ kind: wakeKind, id })
      .then(async () => {
        if (cancelled) return;
        await waitForDevServer();
      })
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
    target,
    wakeKind,
    id,
    sandboxId,
    repoId,
    devPort,
    search.port,
    search.path,
    ensureActive,
    getPreviewUrl,
  ]);
  /* eslint-enable no-effect/no-event-handler */

  if (isLoaded && !isSignedIn) {
    return (
      <RedirectToSignIn
        signInForceRedirectUrl={
          typeof window !== "undefined" ? window.location.href : "/"
        }
      />
    );
  }

  const statusText =
    phase.kind === "error"
      ? phase.message
      : phase.kind === "serving"
        ? "Opening the preview…"
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
