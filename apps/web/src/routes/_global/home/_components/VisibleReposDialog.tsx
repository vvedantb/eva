import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { patchLoadedQuery } from "@vvedantb/server";
import { api } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vvedantb/ui";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { CodebaseCheckList } from "./CodebaseCheckList";

/** Every codebase and app with a checkbox: ticked is shown, unticked hidden. */
export function VisibleReposDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const allRepos = useQuery(api.githubRepos.list, { includeHidden: true });
  const toggleHidden = useMutation(
    api.githubRepos.toggleHidden,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(
      localStore,
      api.githubRepos.list,
      { includeHidden: true },
      (repos) =>
        repos.map((r) =>
          r._id === args.repoId ? { ...r, hidden: args.hidden } : r,
        ),
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Visible Codebases</DialogTitle>
        </DialogHeader>
        <CodebaseCheckList
          items={(allRepos ?? []).map((repo) => ({
            key: repo._id,
            codebase: `${repo.owner}/${repo.name}`,
            label: repo.rootDirectory?.split("/").pop() ?? repo.name,
            title: repo.rootDirectory,
            checked: repo.hidden !== true,
          }))}
          onCheckedChange={(item, checked) => {
            const repo = allRepos?.find((r) => r._id === item.key);
            if (!repo) return;
            void catchMutationError(
              toggleHidden({ repoId: repo._id, hidden: !checked }),
              "Couldn't update codebase visibility",
              "repo-visibility",
            );
          }}
        />
        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
