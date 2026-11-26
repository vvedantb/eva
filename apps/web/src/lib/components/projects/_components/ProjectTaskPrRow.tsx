import { projectTaskPrLine } from "@eva/shared/projectView";
import { IconGitPullRequest } from "@tabler/icons-react";
import { ListRow } from "@vvedantb/ui";
import { prStateIconClass } from "@/lib/components/prStateIconClass";
import type { ProjectTaskListRow } from "../useProjectStatus";
import {
  FLAT_ROW_CLASS,
  FLAT_ROW_CONTENT_CLASS,
  ProjectFlatRowBody,
} from "./ProjectTaskRow";

/**
 * A Pull requests row: the PR icon in its state colour, the task title, and
 * "#9003 · Open · via #904" (with the repo for a multi-repo task's PR). A
 * click opens the PR in a new tab.
 */
export function ProjectTaskPrRow({
  task,
}: {
  task: ProjectTaskListRow & { prUrl: string; repoName?: string };
}) {
  return (
    <ListRow
      link={<a href={task.prUrl} target="_blank" rel="noreferrer" />}
      aria-label={`Open the PR for ${task.title}`}
      className={FLAT_ROW_CLASS}
      contentClassName={FLAT_ROW_CONTENT_CLASS}
    >
      <ProjectFlatRowBody
        icon={
          <IconGitPullRequest
            size={14}
            className={prStateIconClass(task.prState)}
            aria-hidden
          />
        }
        title={task.title}
        line={projectTaskPrLine(task)}
      />
    </ListRow>
  );
}
