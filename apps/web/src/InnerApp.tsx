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
    if (!hadSession && isSignedIn) {
      void router.invalidate();
    }
  }, [isLoaded, isSignedIn]);
  /* eslint-enable no-effect/no-event-handler */

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
