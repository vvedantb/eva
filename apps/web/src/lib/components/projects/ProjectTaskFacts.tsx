"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { IconGitPullRequest } from "@tabler/icons-react";
import { api } from "@eva/backend";
import { projectTaskFacts } from "@eva/shared/projectView";
import { prStateIconClass } from "@/lib/components/prStateIconClass";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import type { ProjectTaskListRow } from "./useProjectStatus";

/**
 * A project task's status and PR line under its title in a task header:
 * "In review · Phase 1", the repos of a multi-repo task, then a link per PR
 * (`projectTaskFacts`). One line; what does not fit is cut. The row is the
 * project's task list row (it carries the server's status facts). Simple
 * view hides the PRs, as it does everywhere.
 */
export function ProjectTaskFacts({ task }: { task: ProjectTaskListRow }) {
  const simpleView = useSimpleView();
  const repos = useQuery(api.githubRepos.list, {});
  const prs = useQuery(
    api.pullRequests.listForOwner,
    simpleView ? "skip" : { owner: { kind: "task", taskId: task._id } },
  );
  const facts = projectTaskFacts(task, repos ?? [], prs ?? []);
  return (
    <p className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
      <span className="truncate">{facts.text}</span>
      {facts.prs.map((pr) => (
        <span key={pr.prUrl} className="inline-flex shrink-0 items-center gap-1.5">
          <span aria-hidden>·</span>
          <a
            href={pr.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
          >
            <IconGitPullRequest
              size={12}
              className={prStateIconClass(pr.state)}
              aria-hidden
            />
            {pr.label}
          </a>
        </span>
      ))}
    </p>
  );
}
