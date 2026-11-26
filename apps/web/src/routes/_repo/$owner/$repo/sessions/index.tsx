import { createFileRoute } from "@tanstack/react-router";
import { NewSessionComposer } from "./_components/NewSessionComposer";

export const Route = createFileRoute("/_repo/$owner/$repo/sessions/")({
  component: SessionsPage,
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
