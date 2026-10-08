/**
 * Membership rules for a codebase group, shared by `repoGroups.create`/`update`
 * and by `sessions.create` (which validates an ad-hoc selection the same way).
 *
 * Pure so both paths cannot drift: a selection Eva would refuse to save must
 * also be refused when it is passed straight into a session.
 */

/** Identity of one repo row, as much of it as the rules need. */
export type RepoGroupMember = {
  id: string;
  owner: string;
  name: string;
};

/**
 * Returns an error message when the selection cannot be cloned side by side, or
 * null when it is valid. The rules:
 *
 * - at least one linked repo (a group of one is just a normal session);
 * - no repeated linked repo, and none of them is the primary;
 * - no two members share a GitHub `name` — they would collide on the same
 *   `/tmp/workspace/<name>` directory;
 * - no two members share `owner/name` — a linked repo is always the whole
 *   checkout, so monorepo sibling app rows would clone the same repository
 *   twice.
 */
export function validateRepoGroupMembers(
  primary: RepoGroupMember,
  linked: ReadonlyArray<RepoGroupMember>,
): string | null {
  if (linked.length === 0) {
    return "Select at least one linked repository";
  }

  const seenIds = new Set<string>([primary.id]);
  const seenNames = new Set<string>([primary.name]);
  const seenSlugs = new Set<string>([`${primary.owner}/${primary.name}`]);

  for (const repo of linked) {
    if (repo.id === primary.id) {
      return "The primary repository cannot also be a linked repository";
    }
    if (seenIds.has(repo.id)) {
      return `Repository ${repo.owner}/${repo.name} is listed twice`;
    }
    const slug = `${repo.owner}/${repo.name}`;
    if (seenSlugs.has(slug)) {
      return `Repository ${slug} is already in this group — a linked repository is always the whole checkout`;
    }
    if (seenNames.has(repo.name)) {
      return `Two repositories are both named "${repo.name}" and would share one workspace folder`;
    }
    seenIds.add(repo.id);
    seenNames.add(repo.name);
    seenSlugs.add(slug);
  }

  return null;
}
