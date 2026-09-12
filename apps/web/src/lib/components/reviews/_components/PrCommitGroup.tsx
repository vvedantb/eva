import type { Id } from "@eva/backend";
import { Surface } from "@eva/ui";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { PrCommitRow } from "./PrCommitRow";
import type { PrCommit } from "./prOverviewMeta";

/**
 * A run of pushed commits under one heading, the way GitHub reports a push. The
 * commits sit on a tonal fill so a long run stays contained instead of pushing the
 * discussion off the screen. Each row opens that commit's diff.
 *
 * Fill only — no outline and no rules between rows. The sha column and the hover
 * fill already separate one commit from the next, and an agent branch of thirty
 * commits drew thirty lines to say what the alignment says for free.
 */
export function PrCommitGroup({
  repoId,
  commits,
}: {
  repoId: Id<"githubRepos">;
  commits: readonly PrCommit[];
}) {
  const authors = [
    ...new Set(commits.map((commit) => commit.authorLogin ?? "unknown")),
  ];
  const soleAuthor = authors.length === 1 ? authors[0] : undefined;
  const noun = commits.length === 1 ? "commit" : "commits";

  return (
    <div className="min-w-0">
      <p className="pt-1 text-sm text-muted-foreground">
        {soleAuthor === undefined ? null : (
          <span className="font-medium text-foreground">{soleAuthor} </span>
        )}
        added {commits.length} {noun}
      </p>

      <Surface density="none" className="mt-1.5 overflow-hidden py-1">
        <ul>
          {commits.map((commit, index) => (
            <ListEnter
              key={commit.sha}
              as="li"
              index={index}
              fast
              slide={false}
              className="min-w-0"
            >
              <PrCommitRow repoId={repoId} commit={commit} />
            </ListEnter>
          ))}
        </ul>
      </Surface>
    </div>
  );
}
