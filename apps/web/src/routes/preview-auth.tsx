import { createFileRoute } from "@tanstack/react-router";
import { useAuth, RedirectToSignIn } from "@clerk/clerk-react";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api } from "@eva/backend";

// The router JSON-parses search values, so `port=3000` arrives as a number.
// Each field falls back to empty so a bad link shows the error, not a crash.
const idParam = z
  .union([z.string(), z.number()])
  .transform(String)
  .catch("");
const searchSchema = z.object({
  sandbox: idParam,
  repo: idParam,
  port: z.coerce.number().int().min(1).max(65535).optional().catch(undefined),
  return: z.string().catch(""),
});

export const Route = createFileRoute("/preview-auth")({
  validateSearch: searchSchema,
  component: PreviewAuth,
});

// Only the path, query and hash of `return` are used. The backend picks the
// origin from the sandbox itself, so a crafted `return` cannot redirect the
// grant to another host.
function returnPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}

/**
 * Handshake route for cold/shared preview links. The in-sandbox proxy redirects
 * unauthenticated visitors here; we require an eva sign-in, confirm repo access
 * via the backend, then redirect to the URL it returns: the sandbox's own
 * preview origin with a short-lived grant attached. The proxy exchanges it for a session cookie.
 */
function PreviewAuth() {
  const { isLoaded, isSignedIn } = useAuth();
  const search = Route.useSearch();
  const mintPreviewGrant = useAction(api.previewGrant.mintPreviewGrant);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || ran.current) return;

    const path = returnPath(search.return);
    const port = search.port;
    if (path === null || !search.repo || !search.sandbox || port === undefined) {
      setError("This preview link is invalid.");
      return;
    }

    ran.current = true;
    mintPreviewGrant({
      sandboxId: search.sandbox,
      port,
      repoId: search.repo,
      path,
    })
      .then((url) => {
        // Cross-origin navigation to the Vercel preview origin — must use the
        // full-page location API, not the SPA router.
        window.location.replace(url);
      })
      .catch((err: Error) => {
        setError(err.message || "You do not have access to this preview.");
      });
  }, [isLoaded, isSignedIn, search, mintPreviewGrant]);

  if (isLoaded && !isSignedIn) {
    return (
      <RedirectToSignIn
        signInForceRedirectUrl={
          typeof window !== "undefined" ? window.location.href : "/"
        }
      />
    );
  }

  return (
    <div className="flex h-dvh items-center justify-center p-6 text-center">
      <p className="text-sm text-muted-foreground">
        {error ?? "Authorising preview access…"}
      </p>
    </div>
  );
}
