import type { Doc, ProjectRole } from "@eva/backend";

export type { ProjectRole };

/**
 * A person's role in every project (decision 12 of the orchestrator plan): no
 * setting for each project. Devs, people with no role set, Eva admins and the
 * owners of the project repo's team are contributors; designers and business
 * users are viewers. The caller checks repo access first.
 */
export function projectRoleFor(
  user: Pick<Doc<"users">, "role" | "isAdmin">,
  isTeamOwner: boolean,
): ProjectRole {
  if (user.isAdmin === true || isTeamOwner) return "contributor";
  return user.role === undefined || user.role === "dev"
    ? "contributor"
    : "viewer";
}
