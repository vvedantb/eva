"use client";

import { Button, Spinner } from "@eva/ui";
import { IconBrandGithub } from "@tabler/icons-react";
import { Container } from "@/lib/components/ui/Container";
import { EmptyState } from "@/lib/components/ui/EmptyState";

/** Where the installation's own permissions are changed. */
const GITHUB_INSTALLATIONS_URL = "https://github.com/settings/installations";

export function RepoSetupLoading() {
  return (
    <Container>
      <div className="flex flex-col items-center justify-center py-20">
        <Spinner size="lg" className="mb-4" />
        <p className="text-muted-foreground">Loading codebases...</p>
      </div>
    </Container>
  );
}

/**
 * A brand-new installation is only verifiable through the user's own GitHub
 * token, so this is the authorize hop rather than a dead end.
 */
export function RepoSetupNeedsAuth({
  authorizing,
  error,
  onAuthorize,
  onCancel,
}: {
  authorizing: boolean;
  error: string | null;
  onAuthorize: () => void;
  onCancel: () => void;
}) {
  return (
    <Container>
      <div className="max-w-md mx-auto py-20 text-center">
        <h1 className="text-xl font-bold text-foreground mb-2">
          Connect your GitHub account
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Eva needs to confirm you can access this installation before adding
          its codebases.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={onAuthorize} disabled={authorizing}>
            {authorizing ? "Redirecting..." : "Continue with GitHub"}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {error ? <p className="text-destructive text-sm mt-4">{error}</p> : null}
      </div>
    </Container>
  );
}

export function RepoSetupError({
  error,
  onBack,
}: {
  error: string;
  onBack: () => void;
}) {
  return (
    <Container>
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="secondary" onClick={onBack}>
          Back to Codebases
        </Button>
      </div>
    </Container>
  );
}

/**
 * The installation granted access to no repository at all. Nothing on this page
 * can fix that, so the only action points at GitHub.
 */
export function RepoSetupEmpty() {
  return (
    <Container>
      <EmptyState
        icon={<IconBrandGithub size={24} />}
        title="This installation has no repositories Eva can see"
        description="Grant the Eva GitHub App access to repositories, then come back here."
        action={
          <Button asChild className="mt-6">
            <a
              href={GITHUB_INSTALLATIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage GitHub access
            </a>
          </Button>
        }
      />
    </Container>
  );
}
