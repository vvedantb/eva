"use client";

import { useNavigate } from "@tanstack/react-router";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { Button } from "@vvedantb/ui";
import { Route } from "@/routes/_global/testing";

export function TestingClient() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  return (
    <PageWrapper title="Testing" comfortable>
      <p className="mb-6 text-sm text-muted-foreground">
        Dev-only tools for previewing onboarding and changelog flows.
      </p>

      <div className="space-y-4">
        <section className="space-y-3 rounded-surface bg-muted/40 p-4">
          <div>
            <h3 className="text-sm font-medium">Welcome setup</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Opens the first-run onboarding dialog. Dismissal is local in
              preview mode so you can reopen it.
            </p>
          </div>
          <Button
            type="button"
            variant={search.welcomeSetup ? "default" : "secondary"}
            onClick={() =>
              void navigate({
                to: "/testing",
                search: {
                  welcomeSetup: true,
                  changelogPreview: undefined,
                  previewNonce: Date.now(),
                },
              })
            }
          >
            {search.welcomeSetup
              ? "Welcome setup open"
              : "Preview welcome setup"}
          </Button>
        </section>

        <section className="space-y-3 rounded-surface bg-muted/40 p-4">
          <div>
            <h3 className="text-sm font-medium">Changelog dialog</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Opens the in-app &quot;What&apos;s New&quot; dialog for the latest
              successful changelog run.
            </p>
          </div>
          <Button
            type="button"
            variant={search.changelogPreview ? "default" : "secondary"}
            onClick={() =>
              void navigate({
                to: "/testing",
                search: {
                  changelogPreview: true,
                  welcomeSetup: undefined,
                  previewNonce: Date.now(),
                },
              })
            }
          >
            {search.changelogPreview
              ? "Changelog dialog open"
              : "Preview changelog dialog"}
          </Button>
        </section>
      </div>
    </PageWrapper>
  );
}
