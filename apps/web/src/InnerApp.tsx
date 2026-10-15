import { useEffect } from "react";
import { RouterProvider, type AnyRouter } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { AuthLoadingScreen } from "./lib/components/AuthLoadingScreen";
import { writeSignedInHint } from "./lib/authHint";

export function InnerApp({
  hadSession,
  router,
}: {
  hadSession: boolean;
  router: AnyRouter;
}) {
  const { isLoaded, isSignedIn } = useAuth();

  /* eslint-disable no-effect/no-event-handler --
     Clerk resolving the session is the event, and it happens outside React:
     the cookie write and the router invalidation both have to follow it. */
  useEffect(() => {
    if (!isLoaded) return;
    writeSignedInHint(isSignedIn ?? false);
    // The early anonymous render below was a guess. If Clerk disagrees (hint
    // cleared but a session exists), re-run route guards so `/` redirects to
    // /home the way a blocking boot would have.
    if (!hadSession && isSignedIn) {
      void router.invalidate();
    }
  }, [isLoaded, isSignedIn]);
  /* eslint-enable no-effect/no-event-handler */

  // Returning signed-in users keep the previous behavior: hold paint until
  // the session is restored, so protected routes never flash the landing.
  if (!isLoaded && hadSession) {
    return <AuthLoadingScreen />;
  }

  return (
    <RouterProvider
      router={router}
      context={{ isSignedIn: isSignedIn ?? false }}
    />
  );
}
