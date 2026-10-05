"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@eva/ui";
import { IconChevronDown } from "@tabler/icons-react";
import {
  shortSha,
  type PrCommit,
} from "@/lib/components/reviews/_components/prOverviewMeta";

const ALL = "all";

function headline(commit: PrCommit): string {
  return commit.message.split("\n")[0] ?? commit.message;
}

/**
 * Which part of the change the Code tab reads: the whole pull request, or one
 * commit of it. Newest first, with the short sha after each headline — the part
 * a reader matches against the timeline.
 */
export function DiffCommitScope({
  commits,
  commit,
  onChange,
}: {
  commits: readonly PrCommit[];
  commit: string | null;
  onChange: (sha: string | null) => void;
}) {
  const selected = commits.find((entry) => entry.sha === commit);
  const label = selected === undefined ? "All commits" : headline(selected);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="xs"
          variant="secondary"
          className="min-w-0 max-w-64"
          aria-label={`Diff scope: ${label}`}
        >
          <span className="truncate">{label}</span>
          <IconChevronDown className="opacity-70" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-80 overflow-auto">
        <DropdownMenuRadioGroup
          value={commit ?? ALL}
          onValueChange={(value) => onChange(value === ALL ? null : value)}
        >
          <DropdownMenuRadioItem value={ALL}>All commits</DropdownMenuRadioItem>
          {[...commits].reverse().map((entry) => (
            <DropdownMenuRadioItem key={entry.sha} value={entry.sha}>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 truncate">{headline(entry)}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                  {shortSha(entry.sha)}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
