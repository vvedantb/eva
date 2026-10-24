import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SignInButton, useAuth } from "@clerk/clerk-react";
import { useConvexAuth, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@eva/backend";
import { Button, Spinner } from "@vvedantb/ui";
import { EvaIcon } from "@/lib/components/EvaIcon";
import {
  clearMcpOauthParams,
  mcpOauthParamsSchema,
  saveMcpOauthParams,
  type McpOauthParams,
} from "@/lib/mcpOauthStorage";

export const Route = createFileRoute("/mcp/oauth/authorize")({
  validateSearch: mcpOauthParamsSchema,
  // Persist the OAuth params before any auth-driven redirect can strip them.
  // Prod Clerk live keys can bounce us to `/home` during the popup's session
  // handshake; `/home` reads this storage to recover us back into the flow.
  // Skipped on preload so a hover cannot overwrite stored params with a
  // half-filled search from some other link.
  beforeLoad: ({ search, preload }) => {
    if (preload) return;
    saveMcpOauthParams(search);
  },
  component: McpOauthAuthorize,
});

/**
 * Gates on Clerk's auth state (not Convex's). If we gated on Convex's
 * `<Unauthenticated>`, a signed-in user with a transient Convex auth
 * loading state could see the sign-in button, click it, and Clerk would
 * redirect them to `signInFallbackRedirectUrl="/home"` (since they're
 * already signed in and there's no real sign-in flow to complete).
 */
function McpOauthAuthorize() {
  const search = Route.useSearch();
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <Shell>
        <Status>Loading...</Status>
      </Shell>
    );
  }

  if (!isSignedIn) {
    return (
      <Shell>
        <SignInPrompt />
      </Shell>
    );
  }

  return (
    <Shell>
      <AuthorizedFlow search={search} />
    </Shell>
  );
}

/** Requires explicit consent before minting an authorization code. */
function AuthorizedFlow({ search }: { search: McpOauthParams }) {
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();
  const authorize = useMutation(api.mcp.oauth.authorize);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (convexLoading || !isAuthenticated) {
    return <Status>Preparing authorization...</Status>;
  }

  const clientUrl = new URL(search.redirect_uri);
  const clientLabel =
    clientUrl.hostname || clientUrl.protocol.replace(":", "") || "MCP client";

  function allowAccess() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    authorize({
      clientId: search.client_id,
      redirectUri: search.redirect_uri,
      codeChallenge: search.code_challenge,
      codeChallengeMethod: search.code_challenge_method,
    })
      .then(({ code }) => {
        clearMcpOauthParams();
        const target = new URL(search.redirect_uri);
        target.searchParams.set("code", code);
        target.searchParams.set("state", search.state);
        window.location.replace(target.toString());
      })
      .catch((err) => {
        const detail =
          err instanceof Error ? err.message : "Authorization failed";
        setError(detail);
        setSubmitting(false);
      });
  }

  function cancelAuthorization() {
    clearMcpOauthParams();
    navigate({ to: "/home", replace: true });
  }

  return (
    <div className="flex w-full flex-col gap-5 text-center">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold text-foreground">
          Allow {clientLabel} to access Eva?
        </h1>
        <p className="text-sm text-muted-foreground">
          This client will be able to use Eva&apos;s MCP tools with your
          account, including your accessible repositories, tasks, documents, and
          connected services.
        </p>
      </div>

      <div className="rounded-xl bg-muted/60 px-4 py-3 text-left">
        <p className="text-xs font-medium text-foreground">Redirecting to</p>
        <p className="mt-1 break-all text-xs text-muted-foreground">
          {search.redirect_uri}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Couldn&apos;t complete authorization: {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          className="flex-1"
          variant="secondary"
          onClick={cancelAuthorization}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button className="flex-1" onClick={allowAccess} disabled={submitting}>
          {submitting ? <Spinner size="sm" /> : null}
          Allow access
        </Button>
      </div>
    </div>
  );
}

function SignInPrompt() {
  const currentUrl = window.location.href;

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-sm font-medium text-foreground">
        Sign in to Eva to connect your MCP client
      </p>
      <SignInButton
        forceRedirectUrl={currentUrl}
        fallbackRedirectUrl={currentUrl}
        signUpForceRedirectUrl={currentUrl}
        signUpFallbackRedirectUrl={currentUrl}
      >
        <Button size="lg">Sign in</Button>
      </SignInButton>
    </div>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <Spinner size="md" />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 max-sm:py-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <EvaIcon
          size={56}
          className="rounded-full outline-solid outline-1 outline-black/10 dark:outline-white/10"
        />
        {children}
      </div>
    </div>
  );
}
