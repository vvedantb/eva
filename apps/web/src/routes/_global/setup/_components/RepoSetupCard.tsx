import { Button, Spinner } from "@eva/ui";
import {
  IconBrandGithub,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  url: string;
}

interface RepoSetupCardProps {
  repo: GitHubRepo;
  isExpanded: boolean;
  isAdded: boolean;
  /** Connect is in flight for this repo. */
  isAdding?: boolean;
  onToggleExpand: () => void;
  onAdd: () => void;
  children: React.ReactNode;
}

export function RepoSetupCard({
  repo,
  isExpanded,
  isAdded,
  isAdding = false,
  onToggleExpand,
  onAdd,
  children,
}: RepoSetupCardProps) {
  return (
    <div className="rounded-surface border border-border bg-muted/40 overflow-hidden">
      <div className="flex items-center justify-between p-3 sm:p-4 bg-card">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <IconBrandGithub className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-sm sm:text-base text-foreground truncate">
              {repo.name}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {repo.owner}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdded ? (
            <span className="flex items-center gap-1 text-success text-xs sm:text-sm">
              <IconCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Added</span>
            </span>
          ) : (
            <Button size="sm" onClick={onAdd} disabled={isAdding}>
              {isAdding ? <Spinner size="sm" /> : null}
              {isAdding ? "Adding" : "Add"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={isExpanded}
            aria-label={`Monorepo apps in ${repo.name}`}
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <IconChevronDown className="w-4 h-4" />
            ) : (
              <IconChevronRight className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-6 bg-muted/30 p-3 sm:p-4 space-y-2">{children}</div>
      )}
    </div>
  );
}
