import { cn } from "@eva/ui";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";
import { repoTileColor } from "@/lib/utils/repoTileColor";

/** A repo in a menu row: its logo (or lettered tile) and display name. */
export function RepoMenuLabel({ repo }: { repo: RepoWithLogo }) {
  const displayName = repoDisplayLabel(repo);
  const tile = repoTileColor(`${repo.owner}/${repo.name}/${displayName}`);
  return (
    <>
      <RepoLogo
        logoUrl={repo.logoUrl}
        size={20}
        fallback={
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded text-3xs font-semibold",
              tile.bg,
              tile.text,
            )}
          >
            {displayName.charAt(0).toUpperCase()}
          </span>
        }
      />
      <span className="truncate">{displayName}</span>
    </>
  );
}
