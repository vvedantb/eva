/** Web path prefix for a githubRepos row (a monorepo app adds its folder name: `/owner/name/app`). */
export function repoBasePath(repo: { owner: string; name: string; rootDirectory?: string }): string {
  if (!repo.rootDirectory) return `/${repo.owner}/${repo.name}`;
  const appName = repo.rootDirectory.split("/").pop();
  if (!appName) return `/${repo.owner}/${repo.name}`;
  return `/${repo.owner}/${repo.name}/${appName}`;
}
