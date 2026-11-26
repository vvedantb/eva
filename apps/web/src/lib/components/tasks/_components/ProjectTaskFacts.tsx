"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { IconGitPullRequest } from "@tabler/icons-react";
import { api, type Doc } from "@eva/backend";
import { projectTaskFacts } from "@eva/shared/projectView";
import { prStateIconClass } from "@/lib/components/prStateIconClass";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

/**
 * A project task's read-only facts on its Details: "Working · Phase 2", the
 * repos of a multi-repo task, then a link per PR (`projectTaskFacts`). The
 * project's task list and the repo list are the queries the project page
 * already holds. Simple view hides the PRs, as it does everywhere.
 */
export function ProjectTaskFacts({ task }: { task: Doc<"agentTasks"> }) {
  const simpleView = useSimpleView();
  const rows = useQuery(
    api.agentTasks.listByProject,
    task.projectId === undefined ? "skip" : { projectId: task.projectId },
  );
  const repos = useQuery(api.githubRepos.list, {});
  const prs = useQuery(
    api.pullRequests.listForOwner,
    simpleView ? "skip" : { owner: { kind: "task", taskId: task._id } },
  );
  // The live task, with the server's status facts from its list row.
  const facts = projectTaskFacts(
    { ...task, facts: rows?.find((row) => row._id === task._id)?.facts },
    repos ?? [],
    prs ?? [],
  );
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      <span>{facts.text}</span>
      {facts.prs.map((pr) => (
        <span key={pr.prUrl} className="inline-flex items-center gap-1.5">
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
