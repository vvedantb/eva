import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vvedantb/ui";
import { IconChevronDown } from "@tabler/icons-react";
import { projectsRepoFilterKey } from "@eva/shared";
import { RepoMenuLabel } from "@/lib/components/RepoMenuLabel";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

const ALL_REPOS = "all";

/** The overview's repo filter: "All repos", then each repo the caller can open. */
export function ProjectsRepoFilter({
  repos,
  value,
  onChange,
}: {
  repos: ReadonlyArray<RepoWithLogo>;
  /** The filtered repo, or null for all repos. */
  value: RepoWithLogo | null;
  onChange: (key: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          aria-label="Repo"
          className="motion-press max-w-48 hover:scale-[1.01] active:scale-[0.96]"
        >
          {value === null ? "All repos" : <RepoMenuLabel repo={value} />}
          <IconChevronDown size={14} aria-hidden className="shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-80 w-64 overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          value={value === null ? ALL_REPOS : projectsRepoFilterKey(value)}
          onValueChange={(next) => onChange(next === ALL_REPOS ? null : next)}
        >
          <DropdownMenuRadioItem value={ALL_REPOS}>All repos</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {repos.map((repo) => (
            <DropdownMenuRadioItem
              key={repo._id}
              value={projectsRepoFilterKey(repo)}
              className="gap-2"
            >
              <RepoMenuLabel repo={repo} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
