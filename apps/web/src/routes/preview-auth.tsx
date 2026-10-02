import { createFileRoute } from "@tanstack/react-router";
import { useAuth, RedirectToSignIn } from "@clerk/clerk-react";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@eva/backend";

const validateSearch = (search: Record<string, string>) => ({
  sandbox: typeof search.sandbox === "string" ? search.sandbox : "",
  repo: typeof search.repo === "string" ? search.repo : "",
  port: typeof search.port === "string" ? search.port : "",
  return: typeof search.return === "string" ? search.return : "",
});

export const Route = createFileRoute("/preview-auth")({
  validateSearch,
  component: PreviewAuth,
});

/**
 * Handshake route for cold/shared preview links. The in-sandbox proxy redirects
 * unauthenticated visitors here; we require an eva sign-in, then the backend
 * confirms repo access, checks the return host (the open-redirect guard lives
 * there, since only it can verify proxy-domain hosts) and hands back the
 * preview URL with a short-lived grant attached. The proxy exchanges the grant
 * for a session cookie.
 */
function PreviewAuth() {
  const { isLoaded, isSignedIn } = useAuth();
  const search = Route.useSearch();
  const mintPreviewGrant = useAction(api.previewGrant.mintPreviewGrant);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || ran.current) return;

    const port = Number(search.port);
    if (
      !search.return ||
      !search.repo ||
      !search.sandbox ||
      !Number.isFinite(port)
    ) {
      setError("This preview link is invalid or points to an untrusted host.");
      return;
    }

    ran.current = true;
    mintPreviewGrant({
      sandboxId: search.sandbox,
      port,
      repoId: search.repo,
      returnUrl: search.return,
    })
      .then((grantedUrl) => {
        // Cross-origin navigation to the preview origin — must use the
        // full-page location API, not the SPA router.
        window.location.replace(grantedUrl);
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
