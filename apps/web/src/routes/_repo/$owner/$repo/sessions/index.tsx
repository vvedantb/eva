import { createFileRoute } from "@tanstack/react-router";
import { NewSessionComposer } from "./_components/NewSessionComposer";

export const Route = createFileRoute("/_repo/$owner/$repo/sessions/")({
  component: SessionsPage,
  // "Stack a new session" on a pull request links here. Declared so the
  // navigation type-checks; the composer reads both through nuqs.
  validateSearch: (search: Record<string, string>) => {
    const stackOn = Number(search.stackOn);
    return {
      stackOn: Number.isInteger(stackOn) && stackOn > 0 ? stackOn : undefined,
      stackBase:
        typeof search.stackBase === "string" ? search.stackBase : undefined,
    };
  },
});

function SessionsPage() {
  return <NewSessionComposer />;
}
