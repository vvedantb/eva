import type { ReactNode } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@vvedantb/ui";
import { RepoMenuLabel } from "@/lib/components/RepoMenuLabel";
import { NewProjectModal } from "@/lib/components/projects/NewProjectModal";
import { RepoScope } from "@/lib/contexts/RepoContext";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";
import { encodeRepoParam } from "@/lib/utils/repoUrl";

/**
 * New Project on the overview. A project needs a home repo: with a repo
 * filtered (or only one) the button uses it, with "All repos" it asks first
 * (as the session tab strip's `+`).
 */
export function NewProjectButton({
  repos,
  filterRepo,
  onPick,
  children,
}: {
  repos: ReadonlyArray<RepoWithLogo>;
  filterRepo: RepoWithLogo | null;
  onPick: (repo: RepoWithLogo) => void;
  /** The button face: its icon and label. */
  children: ReactNode;
}) {
  // One repo needs no question.
  const homeRepo = filterRepo ?? (repos.length === 1 ? repos.at(0) : undefined);
  const button = (
    <Button
      size="sm"
      aria-label="New project"
      className="motion-press hover:scale-[1.01] active:scale-[0.96]"
      onClick={homeRepo === undefined ? undefined : () => onPick(homeRepo)}
    >
      {children}
    </Button>
  );
  if (homeRepo !== undefined) return button;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
        {repos.map((repo) => (
          <DropdownMenuItem
            key={repo._id}
            className="flex items-center gap-2"
            onSelect={() => onPick(repo)}
          >
            <RepoMenuLabel repo={repo} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The New Project dialog for the picked home repo, with that repo's context. */
export function NewProjectDialog({
  repo,
  onClose,
}: {
  repo: RepoWithLogo | null;
  onClose: () => void;
}) {
  if (repo === null) return null;
  return (
    <RepoScope
      key={repo._id}
      owner={repo.owner}
      repoParam={encodeRepoParam(repo.name, repo.rootDirectory)}
    >
      <NewProjectModal isOpen onClose={onClose} />
    </RepoScope>
  );
}
