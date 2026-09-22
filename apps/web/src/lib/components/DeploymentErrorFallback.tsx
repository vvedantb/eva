import { useEffect, useState } from "react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@eva/ui";
import { IconChevronRight } from "@tabler/icons-react";
import { isChunkLoadError } from "@/lib/utils/isChunkLoadError";
import {
  claimStaleDeployReload,
  reloadForStaleDeploy,
} from "@/lib/utils/staleDeployReload";

/**
 * TanStack Router error fallback that silently reloads on stale deployment errors
 * (chunk load failures after a Vercel redeployment) and shows a manual refresh
 * prompt for all other uncaught errors.
 *
 * Real errors used to offer Refresh and nothing else: a refresh loop was the
 * only move, and the message users could send us was "it broke". The details
 * block below is collapsed by default — it is for reporting, not reading.
 */
export function DeploymentErrorFallback({ error }: { error: Error }) {
  const shouldReload = isChunkLoadError(error) && claimStaleDeployReload();

  useEffect(() => {
    if (shouldReload) {
      reloadForStaleDeploy();
    }
  }, [shouldReload]);

  if (shouldReload) {
    return <div className="min-h-dvh w-full bg-background" />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-6 text-center">
        <h1 className="text-balance text-lg font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          Please refresh the page to try again.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" onClick={() => reloadForStaleDeploy()}>
            Refresh
          </Button>
          {/* Not `<Link>`: the router is a plausible cause of whatever threw,
              so this deliberately leaves the SPA and boots a fresh one. */}
          <Button asChild size="sm" variant="secondary">
            <a href="/home">Go home</a>
          </Button>
        </div>

        <ErrorDetails error={error} />
      </div>
    </div>
  );
}

function ErrorDetails({ error }: { error: Error }) {
  const [copied, setCopied] = useState(false);

  const details = `${error.name}: ${error.message}\n${error.stack ?? ""}`;

  return (
    <Collapsible className="mt-5 text-left">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <IconChevronRight
          size={14}
          className="transition-transform group-data-[state=open]:rotate-90"
          aria-hidden
        />
        Details
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-3 text-left text-xs leading-relaxed text-muted-foreground wrap-anywhere whitespace-pre-wrap">
          {error.message}
        </pre>
        <Button
          size="xs"
          variant="secondary"
          className="mt-2"
          onClick={() => {
            void navigator.clipboard.writeText(details).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "Copied" : "Copy details"}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
