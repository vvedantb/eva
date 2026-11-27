import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, RedirectToSignIn, useAuth } from "@clerk/clerk-react";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "@eva/backend";
import { clientEnv } from "@/env/client";
import { convexDeploymentUrl } from "@/lib/convexDeploymentUrl";

/**
 * Handshake page for cold preview links (`/preview-auth`). The in-sandbox
 * proxy sends a visitor without a session cookie here. We need an Eva sign-in,
 * the backend confirms repo access and returns the sandbox's own preview URL
 * with a short-lived grant, and the proxy swaps the grant for a cookie.
 *
 * It is its own Vite entry, not a route in the main app, because every cold
 * preview link waits on it: the main app boots the whole shell, its Convex
 * WebSocket and presence before this page could run. Here it is Clerk, one
 * token and one HTTP action call.
 */

// The proxy builds the query string, so `port=3000` arrives as text. Each
// field falls back to empty so a bad link shows the error, not a crash.
const searchSchema = z.object({
  sandbox: z.string().catch(""),
  repo: z.string().catch(""),
  port: z.coerce.number().int().min(1).max(65535).optional().catch(undefined),
  return: z.string().catch(""),
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

const search = searchSchema.parse(
  Object.fromEntries(new URLSearchParams(window.location.search)),
);
const convex = new ConvexHttpClient(
  convexDeploymentUrl(clientEnv.VITE_CONVEX_URL, window.location.origin),
);

/** Mints the grant and returns the URL to send the browser to. */
async function mintGrantUrl(token: string): Promise<string> {
  const path = returnPath(search.return);
  if (path === null || !search.repo || !search.sandbox || !search.port) {
    throw new Error("This preview link is invalid.");
  }
  convex.setAuth(token);
  return await convex.action(api.previewGrant.mintPreviewGrant, {
    sandboxId: search.sandbox,
    repoId: search.repo,
    port: search.port,
    path,
  });
}

function PreviewAuth() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  /* eslint-disable no-effect/no-event-handler --
     Page-level handshake: the trigger is Clerk restoring the session, not a
     click. One run per page load. */
  useEffect(() => {
    if (!isLoaded || !isSignedIn || ran.current) return;
    ran.current = true;
    getToken({ template: "convex" })
      .then((token) => {
        if (!token) throw new Error("Sign in to Eva to open this preview.");
        return mintGrantUrl(token);
      })
      .then((url) => {
        // Cross-origin navigation to the sandbox preview origin.
        window.location.replace(url);
      })
      .catch((err: Error) => {
        setError(err.message || "You do not have access to this preview.");
      });
  }, [isLoaded, isSignedIn, getToken]);
  /* eslint-enable no-effect/no-event-handler */

  if (isLoaded && !isSignedIn) {
    return <RedirectToSignIn signInForceRedirectUrl={window.location.href} />;
  }
  // The handoff takes well under a second, so the page stays blank until it
  // has something to say.
  if (error === null) return null;
  return (
    <p
      style={{
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
        opacity: 0.7,
        textAlign: "center",
        marginTop: "45vh",
        padding: "0 24px",
      }}
    >
      {error}
    </p>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ClerkProvider publishableKey={clientEnv.VITE_CLERK_PUBLISHABLE_KEY}>
        <PreviewAuth />
      </ClerkProvider>
    </StrictMode>,
  );
}
