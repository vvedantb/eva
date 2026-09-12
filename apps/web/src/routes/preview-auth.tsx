import { createFileRoute } from "@tanstack/react-router";
import { useAuth, RedirectToSignIn } from "@clerk/clerk-react";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@eva/backend";
import { parseAllowedReturn } from "@/lib/utils/previewAuthReturn";

// Must match PREVIEW_GRANT_PARAM in packages/backend/convex/previewGrantConfig.ts.
const GRANT_PARAM = "__eva_grant";

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
 * unauthenticated visitors here; we require an eva sign-in, confirm repo access
 * via the backend, mint a short-lived grant, then redirect back to the preview
 * origin with the grant attached. The proxy exchanges it for a session cookie.
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
    const parsedReturn = parseAllowedReturn(
      search.return,
      search.sandbox,
      port,
    );
    if (
      !parsedReturn ||
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
    })
      .then((grant) => {
        parsedReturn.searchParams.set(GRANT_PARAM, grant);
        // Cross-origin navigation to the Vercel preview origin — must use the
        // full-page location API, not the SPA router.
        window.location.replace(parsedReturn.toString());
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
